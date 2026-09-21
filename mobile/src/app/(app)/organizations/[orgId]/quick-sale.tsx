import { useStripeTerminal } from '@stripe/stripe-terminal-react-native';
import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/button';
import { CardReaderPanel } from '@/components/card-reader-panel';
import { ListItem } from '@/components/list-item';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth-context';
import { formatPrice } from '@/lib/format';
import { useTranslation } from '@/lib/i18n/context';
import {
  createQuickSale,
  createQuickSaleItem,
  deleteQuickSaleItem,
  listQuickSaleItems,
  listQuickSales,
  retryQuickSalePayout,
  type QuickSale,
  type QuickSaleItem,
} from '@/lib/quickSales';

function StatusPill({ label, tone }: { label: string; tone: 'neutral' | 'success' | 'destructive' }) {
  const theme = useTheme();
  const { color, background } =
    tone === 'success'
      ? { color: theme.success, background: theme.successSoft }
      : tone === 'destructive'
        ? { color: theme.destructive, background: theme.destructiveSoft }
        : { color: theme.textSecondary, background: theme.backgroundSelected };
  return <Text style={[styles.badge, { color, backgroundColor: background }]}>{label}</Text>;
}

export default function QuickSaleScreen() {
  const { orgId } = useLocalSearchParams<{ orgId: string }>();
  const { session } = useAuth();
  const { t } = useTranslation();

  const [items, setItems] = useState<QuickSaleItem[]>([]);
  const [sales, setSales] = useState<QuickSale[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [newItemName, setNewItemName] = useState('');
  const [newItemPrice, setNewItemPrice] = useState('');
  const [newItemCurrency, setNewItemCurrency] = useState<'cad' | 'usd'>('cad');
  const [isAddingItem, setIsAddingItem] = useState(false);
  const [addItemError, setAddItemError] = useState<string | null>(null);

  const [activeSaleItemId, setActiveSaleItemId] = useState<string | null>(null);
  const [saleError, setSaleError] = useState<string | null>(null);
  const [retryingSaleId, setRetryingSaleId] = useState<string | null>(null);

  // CardReaderPanel (rendered below) owns the reader's connection lifecycle
  // — this call shares the same underlying StripeTerminalProvider context,
  // so connectedReader/the payment functions here reflect whatever the
  // panel just connected to.
  const { connectedReader, retrievePaymentIntent, collectPaymentMethod, confirmPaymentIntent } = useStripeTerminal();

  const load = useCallback(async () => {
    if (!session) return;
    setIsLoading(true);
    setError(null);
    try {
      const [itemsResult, salesResult] = await Promise.all([
        listQuickSaleItems(session.token, orgId),
        listQuickSales(session.token, orgId),
      ]);
      setItems(itemsResult.items);
      setSales(salesResult.items);
    } catch {
      setError(t('quick_sale.load_error'));
    } finally {
      setIsLoading(false);
    }
  }, [session, orgId, t]);

  useEffect(() => {
    load();
  }, [load]);

  async function onAddItem() {
    if (!session) return;
    const priceCents = Math.round(Number(newItemPrice.replace(',', '.')) * 100);
    if (!newItemName.trim() || !Number.isFinite(priceCents) || priceCents < 1) return;
    setIsAddingItem(true);
    setAddItemError(null);
    try {
      await createQuickSaleItem(session.token, orgId, {
        name: newItemName.trim(),
        price_cents: priceCents,
        currency: newItemCurrency,
      });
      setNewItemName('');
      setNewItemPrice('');
      await load();
    } catch (err) {
      setAddItemError(err instanceof Error ? err.message : t('quick_sale.create_item_error'));
    } finally {
      setIsAddingItem(false);
    }
  }

  function onDeleteItem(item: QuickSaleItem) {
    if (!session) return;
    Alert.alert(t('quick_sale.delete_item_confirm_title'), t('quick_sale.delete_item_confirm_message'), [
      { text: t('quick_sale.delete_item_confirm_cancel'), style: 'cancel' },
      {
        text: t('quick_sale.delete_item_confirm_delete'),
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteQuickSaleItem(session.token, orgId, item.id);
            await load();
          } catch {
            setError(t('quick_sale.delete_item_error'));
          }
        },
      },
    ]);
  }

  async function onSell(item: QuickSaleItem) {
    if (!session || !connectedReader) return;
    setActiveSaleItemId(item.id);
    setSaleError(null);
    try {
      const createResult = await createQuickSale(session.token, orgId, {
        quick_sale_item_id: item.id,
        in_person: true,
      });
      if (!createResult.client_secret) {
        setSaleError(t('quick_sale.payment_not_ready'));
        return;
      }

      const retrieveResult = await retrievePaymentIntent(createResult.client_secret);
      if (retrieveResult.error || !retrieveResult.paymentIntent) {
        setSaleError(retrieveResult.error?.message ?? t('quick_sale.payment_not_ready'));
        return;
      }

      const collectResult = await collectPaymentMethod({ paymentIntent: retrieveResult.paymentIntent });
      if (collectResult.error || !collectResult.paymentIntent) {
        setSaleError(collectResult.error?.message ?? t('card_reader.collect_error'));
        return;
      }

      const confirmResult = await confirmPaymentIntent({ paymentIntent: collectResult.paymentIntent });
      if (confirmResult.error) {
        setSaleError(confirmResult.error.message ?? t('card_reader.confirm_error'));
        return;
      }

      await load();
    } catch (err) {
      setSaleError(err instanceof Error ? err.message : t('quick_sale.sell_error'));
    } finally {
      setActiveSaleItemId(null);
    }
  }

  async function onRetryPayout(sale: QuickSale) {
    if (!session) return;
    setRetryingSaleId(sale.id);
    try {
      await retryQuickSalePayout(session.token, orgId, sale.id);
      await load();
    } catch {
      setError(t('quick_sale.retry_payout_error'));
    } finally {
      setRetryingSaleId(null);
    }
  }

  if (isLoading || !session) {
    return (
      <ThemedView style={styles.container}>
        <ActivityIndicator style={styles.loader} />
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <View style={styles.content}>
        {error ? (
          <ThemedText type="small" themeColor="destructive" style={styles.error}>
            {error}
          </ThemedText>
        ) : null}

        <ThemedText type="subtitle" style={styles.sectionTitle}>
          {t('card_reader.section_title')}
        </ThemedText>
        <CardReaderPanel orgId={orgId} token={session.token} />

        <ThemedText type="subtitle" style={styles.sectionTitle}>
          {t('quick_sale.catalog_title')}
        </ThemedText>

        {items.length === 0 ? (
          <ThemedText type="small" themeColor="textSecondary" style={styles.empty}>
            {t('quick_sale.catalog_empty')}
          </ThemedText>
        ) : (
          items.map((item) => (
            <ListItem
              key={item.id}
              title={item.name}
              subtitle={formatPrice(item.price_cents, item.currency.toUpperCase())}
              right={
                <View style={styles.itemActions}>
                  <Button
                    title={t('quick_sale.sell_button')}
                    onPress={() => onSell(item)}
                    loading={activeSaleItemId === item.id}
                    disabled={!connectedReader || activeSaleItemId !== null}
                    style={styles.sellButton}
                  />
                  <Button title="×" variant="ghost" onPress={() => onDeleteItem(item)} style={styles.deleteButton} />
                </View>
              }
            />
          ))
        )}

        {saleError ? (
          <ThemedText type="small" themeColor="destructive" style={styles.error}>
            {saleError}
          </ThemedText>
        ) : null}

        <ThemedView type="backgroundElement" style={styles.card}>
          <TextField label={t('quick_sale.item_name_label')} value={newItemName} onChangeText={setNewItemName} />
          <TextField
            label={t('quick_sale.item_price_label')}
            value={newItemPrice}
            onChangeText={setNewItemPrice}
            keyboardType="decimal-pad"
          />
          <View style={styles.currencyRow}>
            <Button
              title={t('quick_sale.item_currency_cad')}
              variant={newItemCurrency === 'cad' ? 'primary' : 'ghost'}
              onPress={() => setNewItemCurrency('cad')}
              style={styles.currencyButton}
            />
            <Button
              title={t('quick_sale.item_currency_usd')}
              variant={newItemCurrency === 'usd' ? 'primary' : 'ghost'}
              onPress={() => setNewItemCurrency('usd')}
              style={styles.currencyButton}
            />
          </View>
          {addItemError ? (
            <ThemedText type="small" themeColor="destructive" style={styles.error}>
              {addItemError}
            </ThemedText>
          ) : null}
          <Button
            title={t('quick_sale.add_item_button')}
            onPress={onAddItem}
            loading={isAddingItem}
            disabled={!newItemName.trim() || !newItemPrice.trim()}
          />
        </ThemedView>

        <ThemedText type="subtitle" style={styles.sectionTitle}>
          {t('quick_sale.recent_sales_title')}
        </ThemedText>

        {sales.length === 0 ? (
          <ThemedText type="small" themeColor="textSecondary" style={styles.empty}>
            {t('quick_sale.recent_sales_empty')}
          </ThemedText>
        ) : (
          sales.map((sale) => (
            <ThemedView key={sale.id} type="backgroundElement" style={styles.saleCard}>
              <View style={styles.saleHeaderRow}>
                <ThemedText type="smallBold" style={styles.flexText}>
                  {sale.item_name} — {formatPrice(sale.total_cents, sale.currency.toUpperCase())}
                </ThemedText>
                <StatusPill
                  label={t(`quick_sale.status_${sale.status}` as 'quick_sale.status_pending')}
                  tone={sale.status === 'paid' ? 'success' : sale.status === 'failed' ? 'destructive' : 'neutral'}
                />
              </View>
              {sale.status === 'paid' ? (
                <View style={styles.payoutRow}>
                  <ThemedText type="small" themeColor="textSecondary" style={styles.flexText}>
                    {t(`quick_sale.payout_status_${sale.payout_status}` as 'quick_sale.payout_status_not_attempted')}
                  </ThemedText>
                  {sale.payout_status === 'failed' ? (
                    <Button
                      title={t('quick_sale.retry_payout_button')}
                      variant="ghost"
                      onPress={() => onRetryPayout(sale)}
                      loading={retryingSaleId === sale.id}
                      style={styles.retryButton}
                    />
                  ) : null}
                </View>
              ) : null}
            </ThemedView>
          ))
        )}
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    padding: Spacing.four,
  },
  loader: {
    marginTop: Spacing.six,
  },
  error: {
    marginBottom: Spacing.two,
  },
  sectionTitle: {
    marginTop: Spacing.five,
    marginBottom: Spacing.three,
  },
  card: {
    borderRadius: Radius.medium,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  itemActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  sellButton: {
    paddingHorizontal: Spacing.three,
  },
  deleteButton: {
    paddingHorizontal: Spacing.two,
  },
  currencyRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  currencyButton: {
    flex: 1,
  },
  empty: {
    textAlign: 'center',
    marginTop: Spacing.four,
    marginBottom: Spacing.four,
  },
  saleCard: {
    borderRadius: Radius.medium,
    padding: Spacing.three,
    marginBottom: Spacing.two,
    gap: 4,
  },
  saleHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  flexText: {
    flex: 1,
  },
  payoutRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  retryButton: {
    paddingHorizontal: Spacing.three,
  },
  badge: {
    fontSize: 11,
    fontWeight: '700',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    overflow: 'hidden',
  },
});
