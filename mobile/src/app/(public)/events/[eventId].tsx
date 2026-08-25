import { useStripe } from '@stripe/stripe-react-native';
import { useFocusEffect, useLocalSearchParams, useNavigation } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { ListItem } from '@/components/list-item';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { createOrder, type CheckoutResult } from '@/lib/checkout';
import { getPublicEvent, listPublicTicketTypes } from '@/lib/discover';
import { formatPrice } from '@/lib/format';
import { useTranslation } from '@/lib/i18n/context';
import type { Event } from '@/lib/events';
import type { TicketType } from '@/lib/ticketTypes';

export default function PublicEventScreen() {
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const navigation = useNavigation();
  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  const { t, localeTag } = useTranslation();

  const [event, setEvent] = useState<Event | null>(null);
  const [ticketTypes, setTicketTypes] = useState<TicketType[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedTypeId, setSelectedTypeId] = useState<string | null>(null);
  const [buyerEmail, setBuyerEmail] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [isOrdering, setIsOrdering] = useState(false);
  const [orderError, setOrderError] = useState<string | null>(null);
  const [checkoutResult, setCheckoutResult] = useState<CheckoutResult | null>(null);
  const [isPaymentReady, setIsPaymentReady] = useState(false);
  const [isPaying, setIsPaying] = useState(false);
  const [paymentSucceeded, setPaymentSucceeded] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const [eventResult, ticketTypesResult] = await Promise.all([
        getPublicEvent(eventId),
        listPublicTicketTypes(eventId),
      ]);
      setEvent(eventResult.event);
      setTicketTypes(ticketTypesResult.items);
      navigation.setOptions({ title: eventResult.event.name });
    } catch {
      setError(t('event_detail.load_error'));
    } finally {
      setIsLoading(false);
    }
  }, [eventId, navigation, t]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function onOrder() {
    if (!selectedTypeId || !buyerEmail.trim()) return;
    const parsedQuantity = Number(quantity);
    if (!Number.isInteger(parsedQuantity) || parsedQuantity < 1) return;
    setIsOrdering(true);
    setOrderError(null);
    setCheckoutResult(null);
    setPaymentError(null);
    setPaymentSucceeded(false);
    setIsPaymentReady(false);
    try {
      const result = await createOrder(null, eventId, {
        buyer_email: buyerEmail.trim(),
        line_items: [{ ticket_type_id: selectedTypeId, quantity: parsedQuantity }],
      });
      setCheckoutResult(result);

      if (result.client_secret) {
        const { error: initError } = await initPaymentSheet({
          merchantDisplayName: 'Intahe',
          paymentIntentClientSecret: result.client_secret,
        });
        if (initError) {
          setPaymentError(initError.message);
        } else {
          setIsPaymentReady(true);
        }
      }
    } catch (err) {
      setOrderError(err instanceof Error ? err.message : t('event_detail.order_error_generic'));
    } finally {
      setIsOrdering(false);
    }
  }

  async function onPay() {
    setIsPaying(true);
    setPaymentError(null);
    try {
      const { error: presentError } = await presentPaymentSheet();
      if (presentError) {
        setPaymentError(presentError.message);
      } else {
        setPaymentSucceeded(true);
      }
    } finally {
      setIsPaying(false);
    }
  }

  if (isLoading || !event) {
    return (
      <ThemedView style={styles.container}>
        <ActivityIndicator style={styles.loader} />
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <ThemedText type="title" style={styles.title}>
          {event.name}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary" style={styles.dates}>
          {t('event_detail.date_range', {
            start: new Date(event.start_at).toLocaleString(localeTag),
            end: new Date(event.end_at).toLocaleString(localeTag),
          })}
        </ThemedText>
        {event.address ? (
          <ThemedText type="small" themeColor="textSecondary">
            {event.address}
          </ThemedText>
        ) : null}
        {event.description ? <ThemedText style={styles.description}>{event.description}</ThemedText> : null}

        {error ? (
          <ThemedText type="small" themeColor="destructive" style={styles.error}>
            {error}
          </ThemedText>
        ) : null}

        <View style={styles.section}>
          <ThemedText type="subtitle">{t('event_detail.tickets_heading')}</ThemedText>
          {ticketTypes.length === 0 ? (
            <ThemedText type="small" themeColor="textSecondary" style={styles.empty}>
              {t('event_detail.tickets_empty')}
            </ThemedText>
          ) : (
            ticketTypes.map((type) => (
              <ListItem
                key={type.id}
                title={type.name}
                subtitle={`${formatPrice(type.price_cents, type.currency, localeTag)} · ${t('event_detail.remaining', { count: type.quantity_total - type.quantity_sold })}`}
                onPress={() => setSelectedTypeId(type.id)}
                right={
                  selectedTypeId === type.id ? (
                    <ThemedText type="smallBold" themeColor="primary">
                      {t('event_detail.selected')}
                    </ThemedText>
                  ) : null
                }
              />
            ))
          )}
        </View>

        {ticketTypes.length > 0 ? (
          <View style={styles.section}>
            <View style={styles.createForm}>
              <TextField
                label={t('event_detail.buyer_email')}
                value={buyerEmail}
                onChangeText={setBuyerEmail}
                keyboardType="email-address"
                autoCapitalize="none"
              />
              <TextField
                label={t('event_detail.quantity')}
                value={quantity}
                onChangeText={setQuantity}
                keyboardType="number-pad"
              />

              {orderError ? (
                <ThemedText type="small" themeColor="destructive" style={styles.error}>
                  {orderError}
                </ThemedText>
              ) : null}

              <Button
                title={t('event_detail.order_button')}
                onPress={onOrder}
                loading={isOrdering}
                disabled={!selectedTypeId || !buyerEmail.trim()}
              />
            </View>

            {checkoutResult ? (
              <ThemedView type="backgroundElement" style={styles.receipt}>
                <ThemedText type="smallBold">{t('event_detail.order_created')}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {t('event_detail.total', {
                    amount: formatPrice(
                      checkoutResult.order.total_cents,
                      ticketTypes.find((tt) => tt.id === selectedTypeId)?.currency ?? 'CAD',
                      localeTag,
                    ),
                  })}
                </ThemedText>

                {paymentError ? (
                  <ThemedText type="small" themeColor="destructive" style={styles.paymentNote}>
                    {paymentError}
                  </ThemedText>
                ) : null}

                {paymentSucceeded ? (
                  // No "view tickets" link here: the access token doesn't
                  // exist until the payment_intent.succeeded webhook issues
                  // the tickets, which hasn't necessarily happened by the
                  // time this resolves. The confirmation email (sent from
                  // that same webhook, once the token exists) is the
                  // reliable way to reach the buyer.
                  <ThemedText type="smallBold" themeColor="success" style={styles.paymentNote}>
                    {t('event_detail.payment_succeeded')}
                  </ThemedText>
                ) : isPaymentReady ? (
                  <Button
                    title={t('event_detail.pay_now')}
                    onPress={onPay}
                    loading={isPaying}
                    style={styles.viewTicketsButton}
                  />
                ) : (
                  <ThemedText type="small" themeColor="textSecondary">
                    {t('event_detail.status', { status: checkoutResult.order.status })}
                  </ThemedText>
                )}
              </ThemedView>
            ) : null}
          </View>
        ) : null}
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: Spacing.four,
  },
  title: {
    marginBottom: Spacing.two,
  },
  dates: {
    marginBottom: Spacing.one,
  },
  description: {
    marginTop: Spacing.four,
  },
  error: {
    marginTop: Spacing.two,
  },
  loader: {
    marginTop: Spacing.six,
  },
  section: {
    marginTop: Spacing.six,
  },
  createForm: {
    marginTop: Spacing.three,
    marginBottom: Spacing.four,
  },
  empty: {
    textAlign: 'center',
    marginTop: Spacing.three,
  },
  receipt: {
    borderRadius: 10,
    padding: Spacing.three,
    gap: 4,
  },
  paymentNote: {
    marginTop: Spacing.two,
  },
  viewTicketsButton: {
    marginTop: Spacing.three,
    alignSelf: 'flex-start',
    paddingHorizontal: Spacing.three,
  },
});
