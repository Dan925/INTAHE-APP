import { useStripeTerminal } from '@stripe/stripe-terminal-react-native';
import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { CardReaderPanel } from '@/components/card-reader-panel';
import { ListItem } from '@/components/list-item';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radius, Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth-context';
import { createDoorSale } from '@/lib/checkout';
import { formatPrice } from '@/lib/format';
import { useTranslation } from '@/lib/i18n/context';
import { listTicketTypes, type TicketType } from '@/lib/ticketTypes';

export default function DoorSaleScreen() {
  const { orgId, eventId } = useLocalSearchParams<{ orgId: string; eventId: string }>();
  const { session } = useAuth();
  const { t } = useTranslation();

  const [ticketTypes, setTicketTypes] = useState<TicketType[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [sellingType, setSellingType] = useState<TicketType | null>(null);
  const [buyerEmail, setBuyerEmail] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [isSelling, setIsSelling] = useState(false);
  const [saleError, setSaleError] = useState<string | null>(null);
  const [lastSaleSucceeded, setLastSaleSucceeded] = useState(false);

  // CardReaderPanel (rendered below) owns the reader's connection lifecycle
  // — this call shares the same underlying StripeTerminalProvider context.
  const { connectedReader, retrievePaymentIntent, collectPaymentMethod, confirmPaymentIntent } = useStripeTerminal();

  const load = useCallback(async () => {
    if (!session) return;
    setIsLoading(true);
    setError(null);
    try {
      const result = await listTicketTypes(session.token, orgId, eventId);
      setTicketTypes(result.items);
    } catch {
      setError(t('door_sale.load_error'));
    } finally {
      setIsLoading(false);
    }
  }, [session, orgId, eventId, t]);

  useEffect(() => {
    load();
  }, [load]);

  function onStartSell(type: TicketType) {
    setSellingType(type);
    setBuyerEmail('');
    setQuantity('1');
    setSaleError(null);
    setLastSaleSucceeded(false);
  }

  async function onConfirmSell() {
    if (!session || !sellingType || !connectedReader) return;
    const quantityNumber = Number(quantity);
    if (!buyerEmail.trim() || !Number.isInteger(quantityNumber) || quantityNumber < 1) return;

    setIsSelling(true);
    setSaleError(null);
    try {
      const createResult = await createDoorSale(session.token, orgId, eventId, {
        buyer_email: buyerEmail.trim(),
        line_items: [{ ticket_type_id: sellingType.id, quantity: quantityNumber }],
      });
      if (!createResult.client_secret) {
        setSaleError(t('door_sale.payment_not_ready'));
        return;
      }

      const retrieveResult = await retrievePaymentIntent(createResult.client_secret);
      if (retrieveResult.error || !retrieveResult.paymentIntent) {
        setSaleError(retrieveResult.error?.message ?? t('door_sale.payment_not_ready'));
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

      setLastSaleSucceeded(true);
      setSellingType(null);
      await load();
    } catch (err) {
      setSaleError(err instanceof Error ? err.message : t('door_sale.sell_error'));
    } finally {
      setIsSelling(false);
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

        {lastSaleSucceeded ? (
          <ThemedText type="smallBold" themeColor="success" style={styles.success}>
            {t('door_sale.payment_succeeded')}
          </ThemedText>
        ) : null}

        {sellingType ? (
          <ThemedView type="backgroundElement" style={styles.card}>
            <ThemedText type="smallBold">
              {sellingType.name} — {formatPrice(sellingType.price_cents, sellingType.currency.toUpperCase())}
            </ThemedText>
            <TextField
              label={t('door_sale.buyer_email_label')}
              value={buyerEmail}
              onChangeText={setBuyerEmail}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
            />
            <TextField
              label={t('door_sale.quantity_label')}
              value={quantity}
              onChangeText={setQuantity}
              keyboardType="number-pad"
            />
            {saleError ? (
              <ThemedText type="small" themeColor="destructive" style={styles.error}>
                {saleError}
              </ThemedText>
            ) : null}
            <View style={styles.row}>
              <Button
                title={t('organization_detail.cancel_button')}
                variant="ghost"
                onPress={() => setSellingType(null)}
                style={styles.flexButton}
              />
              <Button
                title={t('door_sale.sell_button')}
                onPress={onConfirmSell}
                loading={isSelling}
                disabled={!connectedReader || !buyerEmail.trim() || !Number(quantity)}
                style={styles.flexButton}
              />
            </View>
          </ThemedView>
        ) : null}

        <ThemedText type="subtitle" style={styles.sectionTitle}>
          {t('manage_event.ticket_types_title')}
        </ThemedText>

        {ticketTypes.length === 0 ? (
          <ThemedText type="small" themeColor="textSecondary" style={styles.empty}>
            {t('door_sale.ticket_types_empty')}
          </ThemedText>
        ) : (
          ticketTypes.map((type) => (
            <ListItem
              key={type.id}
              title={type.name}
              subtitle={`${formatPrice(type.price_cents, type.currency.toUpperCase())} · ${type.quantity_sold}/${type.quantity_total}`}
              right={
                <Button
                  title={t('door_sale.sell_button')}
                  onPress={() => onStartSell(type)}
                  disabled={!connectedReader || sellingType !== null}
                  style={styles.sellButton}
                />
              }
            />
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
  success: {
    marginTop: Spacing.three,
  },
  sectionTitle: {
    marginTop: Spacing.five,
    marginBottom: Spacing.three,
  },
  card: {
    borderRadius: Radius.medium,
    padding: Spacing.three,
    marginTop: Spacing.three,
    gap: Spacing.two,
  },
  row: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  flexButton: {
    flex: 1,
  },
  sellButton: {
    paddingHorizontal: Spacing.three,
  },
  empty: {
    textAlign: 'center',
    marginTop: Spacing.four,
  },
});
