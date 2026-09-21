import { useStripeTerminal, type Reader } from '@stripe/stripe-terminal-react-native';
import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/button';
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
  getReaderLocationId,
  listQuickSaleItems,
  listQuickSales,
  retryQuickSalePayout,
  setUpReaderLocation,
  type QuickSale,
  type QuickSaleItem,
} from '@/lib/quickSales';
import { setTerminalSession } from '@/lib/terminalSession';

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
  const [locationId, setLocationId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showReaderSetup, setShowReaderSetup] = useState(false);
  const [setupName, setSetupName] = useState('');
  const [setupLine1, setSetupLine1] = useState('');
  const [setupCity, setSetupCity] = useState('');
  const [setupState, setSetupState] = useState('');
  const [setupPostalCode, setSetupPostalCode] = useState('');
  const [isSettingUp, setIsSettingUp] = useState(false);
  const [setupError, setSetupError] = useState<string | null>(null);

  const [isDiscovering, setIsDiscovering] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [readerError, setReaderError] = useState<string | null>(null);

  const [newItemName, setNewItemName] = useState('');
  const [newItemPrice, setNewItemPrice] = useState('');
  const [newItemCurrency, setNewItemCurrency] = useState<'cad' | 'usd'>('cad');
  const [isAddingItem, setIsAddingItem] = useState(false);
  const [addItemError, setAddItemError] = useState<string | null>(null);

  const [activeSaleItemId, setActiveSaleItemId] = useState<string | null>(null);
  const [saleError, setSaleError] = useState<string | null>(null);
  const [retryingSaleId, setRetryingSaleId] = useState<string | null>(null);

  const {
    initialize,
    discoverReaders,
    connectReader,
    disconnectReader,
    retrievePaymentIntent,
    collectPaymentMethod,
    confirmPaymentIntent,
    connectedReader,
    discoveredReaders,
    isInitialized,
  } = useStripeTerminal();

  // The SDK's global tokenProvider (wired once at the app root — see
  // _layout.tsx) has no per-call arguments, so it reads this org's id/token
  // from a module-level holder instead. Set on focus, cleared on leaving so
  // a stale organization never leaks into some other screen's reconnect.
  useEffect(() => {
    setTerminalSession(session?.token ?? null, orgId);
    return () => setTerminalSession(null, null);
  }, [session, orgId]);

  const didInitRef = useRef(false);
  useEffect(() => {
    if (didInitRef.current || !session) return;
    didInitRef.current = true;
    initialize().then((result) => {
      if (result.error) setReaderError(result.error.message);
    });
  }, [session, initialize]);

  useEffect(() => {
    return () => {
      if (connectedReader) disconnectReader();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = useCallback(async () => {
    if (!session) return;
    setIsLoading(true);
    setError(null);
    try {
      const [itemsResult, salesResult, locationResult] = await Promise.all([
        listQuickSaleItems(session.token, orgId),
        listQuickSales(session.token, orgId),
        getReaderLocationId(session.token, orgId),
      ]);
      setItems(itemsResult.items);
      setSales(salesResult.items);
      setLocationId(locationResult.location_id);
    } catch {
      setError(t('quick_sale.load_error'));
    } finally {
      setIsLoading(false);
    }
  }, [session, orgId, t]);

  useEffect(() => {
    load();
  }, [load]);

  async function onSetUpReader() {
    if (!session || !setupName.trim() || !setupLine1.trim() || !setupCity.trim() || !setupPostalCode.trim()) return;
    setIsSettingUp(true);
    setSetupError(null);
    try {
      await setUpReaderLocation(session.token, orgId, {
        display_name: setupName.trim(),
        address: {
          line1: setupLine1.trim(),
          city: setupCity.trim(),
          ...(setupState.trim() ? { state: setupState.trim() } : {}),
          postal_code: setupPostalCode.trim(),
          country: 'CA',
        },
      });
      setShowReaderSetup(false);
      await load();
    } catch (err) {
      setSetupError(err instanceof Error ? err.message : t('quick_sale.reader_setup_error'));
    } finally {
      setIsSettingUp(false);
    }
  }

  async function onDiscoverAndConnect() {
    if (!locationId) return;
    setReaderError(null);
    setIsDiscovering(true);
    try {
      const discovery = await discoverReaders({ discoveryMethod: 'internet', locationId, timeout: 0 });
      if (discovery.error) {
        setReaderError(discovery.error.message);
        setIsDiscovering(false);
        return;
      }
    } catch (err) {
      setReaderError(err instanceof Error ? err.message : t('quick_sale.reader_connect_error'));
      setIsDiscovering(false);
    }
  }

  // discoverReaders streams results into discoveredReaders rather than
  // resolving with them — stop showing the "discovering" state once at
  // least one reader has shown up, or leave it running so the merchant can
  // still retry if none appear yet.
  useEffect(() => {
    if (discoveredReaders.length > 0) setIsDiscovering(false);
  }, [discoveredReaders]);

  async function onConnect(reader: Reader.Type) {
    setIsConnecting(true);
    setReaderError(null);
    try {
      const result = await connectReader({ discoveryMethod: 'internet', reader, failIfInUse: false });
      if (result.error) setReaderError(result.error.message);
    } catch (err) {
      setReaderError(err instanceof Error ? err.message : t('quick_sale.reader_connect_error'));
    } finally {
      setIsConnecting(false);
      setIsDiscovering(false);
    }
  }

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
        setSaleError(collectResult.error?.message ?? t('quick_sale.reader_collect_error'));
        return;
      }

      const confirmResult = await confirmPaymentIntent({ paymentIntent: collectResult.paymentIntent });
      if (confirmResult.error) {
        setSaleError(confirmResult.error.message ?? t('quick_sale.reader_confirm_error'));
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

  if (isLoading) {
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
          {t('quick_sale.reader_section_title')}
        </ThemedText>

        {!locationId ? (
          showReaderSetup ? (
            <ThemedView type="backgroundElement" style={styles.card}>
              <TextField
                label={t('quick_sale.reader_display_name_label')}
                value={setupName}
                onChangeText={setSetupName}
              />
              <TextField
                label={t('quick_sale.reader_address_line1_label')}
                value={setupLine1}
                onChangeText={setSetupLine1}
              />
              <TextField label={t('quick_sale.reader_address_city_label')} value={setupCity} onChangeText={setSetupCity} />
              <TextField
                label={t('quick_sale.reader_address_state_label')}
                value={setupState}
                onChangeText={setSetupState}
              />
              <TextField
                label={t('quick_sale.reader_address_postal_code_label')}
                value={setupPostalCode}
                onChangeText={setSetupPostalCode}
              />
              {setupError ? (
                <ThemedText type="small" themeColor="destructive" style={styles.error}>
                  {setupError}
                </ThemedText>
              ) : null}
              <Button
                title={t('quick_sale.reader_setup_submit')}
                onPress={onSetUpReader}
                loading={isSettingUp}
                disabled={!setupName.trim() || !setupLine1.trim() || !setupCity.trim() || !setupPostalCode.trim()}
              />
            </ThemedView>
          ) : (
            <ThemedView type="backgroundElement" style={styles.card}>
              <ThemedText type="small" themeColor="textSecondary" style={styles.cardText}>
                {t('quick_sale.reader_not_set_up')}
              </ThemedText>
              <Button title={t('quick_sale.reader_setup_button')} variant="ghost" onPress={() => setShowReaderSetup(true)} />
            </ThemedView>
          )
        ) : connectedReader ? (
          <ThemedView type="backgroundElement" style={styles.card}>
            <ThemedText type="small">
              {t('quick_sale.reader_connected_prefix', { label: connectedReader.label ?? connectedReader.serialNumber })}
            </ThemedText>
            <Button title={t('quick_sale.reader_disconnect_button')} variant="ghost" onPress={() => disconnectReader()} />
          </ThemedView>
        ) : (
          <ThemedView type="backgroundElement" style={styles.card}>
            {readerError ? (
              <ThemedText type="small" themeColor="destructive" style={styles.error}>
                {readerError}
              </ThemedText>
            ) : null}
            {discoveredReaders.length > 0 ? (
              discoveredReaders.map((reader) => (
                <ListItem
                  key={reader.id}
                  title={reader.label ?? reader.serialNumber}
                  onPress={() => onConnect(reader)}
                  right={isConnecting ? <ActivityIndicator size="small" /> : undefined}
                />
              ))
            ) : isDiscovering ? (
              <View style={styles.discoveringRow}>
                <ActivityIndicator size="small" />
                <ThemedText type="small" themeColor="textSecondary">
                  {t('quick_sale.reader_discovering')}
                </ThemedText>
              </View>
            ) : (
              <Button
                title={t('quick_sale.reader_connect_button')}
                variant="ghost"
                onPress={onDiscoverAndConnect}
                disabled={!isInitialized}
              />
            )}
          </ThemedView>
        )}

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
                  <Button
                    title="×"
                    variant="ghost"
                    onPress={() => onDeleteItem(item)}
                    style={styles.deleteButton}
                  />
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
  cardText: {
    marginBottom: Spacing.two,
  },
  discoveringRow: {
    flexDirection: 'row',
    alignItems: 'center',
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
