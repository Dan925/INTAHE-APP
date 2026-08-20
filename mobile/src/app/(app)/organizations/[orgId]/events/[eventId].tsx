import { useStripe } from '@stripe/stripe-react-native';
import { useFocusEffect, useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { ListItem } from '@/components/list-item';
import { StatusBadge } from '@/components/status-badge';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth-context';
import { createOrder, type CheckoutResult } from '@/lib/checkout';
import { cancelEvent, getEvent, publishEvent, type Event } from '@/lib/events';
import { formatPrice } from '@/lib/format';
import { useTranslation } from '@/lib/i18n/context';
import { createTicketType, listTicketTypes, type TicketType } from '@/lib/ticketTypes';

export default function EventScreen() {
  const { orgId, eventId } = useLocalSearchParams<{ orgId: string; eventId: string }>();
  const { session } = useAuth();
  const navigation = useNavigation();
  const router = useRouter();
  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  const { t, localeTag } = useTranslation();

  const [event, setEvent] = useState<Event | null>(null);
  const [ticketTypes, setTicketTypes] = useState<TicketType[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [isCreatingType, setIsCreatingType] = useState(false);
  const [typeName, setTypeName] = useState('');
  const [typePrice, setTypePrice] = useState('');
  const [typeQuantity, setTypeQuantity] = useState('');

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
    if (!session) return;
    setIsLoading(true);
    try {
      const [eventResult, ticketTypesResult] = await Promise.all([
        getEvent(session.token, orgId, eventId),
        listTicketTypes(session.token, orgId, eventId),
      ]);
      setEvent(eventResult.event);
      setTicketTypes(ticketTypesResult.items);
      navigation.setOptions({ title: eventResult.event.name });
    } catch {
      setError(t('manage_event.load_error'));
    } finally {
      setIsLoading(false);
    }
  }, [session, orgId, eventId, navigation, t]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function onPublish() {
    if (!session) return;
    setIsUpdating(true);
    setError(null);
    try {
      const result = await publishEvent(session.token, orgId, eventId);
      setEvent(result.event);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('manage_event.action_error'));
    } finally {
      setIsUpdating(false);
    }
  }

  async function onCancel() {
    if (!session) return;
    setIsUpdating(true);
    setError(null);
    try {
      const result = await cancelEvent(session.token, orgId, eventId);
      setEvent(result.event);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('manage_event.action_error'));
    } finally {
      setIsUpdating(false);
    }
  }

  async function onCreateTicketType() {
    if (!session) return;
    const priceCents = Math.round(Number(typePrice.replace(',', '.')) * 100);
    const quantityTotal = Number(typeQuantity);
    if (!typeName.trim() || !Number.isFinite(priceCents) || priceCents < 0 || !Number.isInteger(quantityTotal) || quantityTotal < 1) {
      return;
    }
    setIsCreatingType(true);
    setError(null);
    try {
      await createTicketType(session.token, orgId, eventId, {
        name: typeName.trim(),
        price_cents: priceCents,
        quantity_total: quantityTotal,
        currency: 'cad',
      });
      setTypeName('');
      setTypePrice('');
      setTypeQuantity('');
      setShowCreateForm(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('manage_event.create_ticket_type_error'));
    } finally {
      setIsCreatingType(false);
    }
  }

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
      const result = await createOrder(session?.token ?? null, eventId, {
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
        <View style={styles.headerRow}>
          <ThemedText type="title" style={styles.title}>
            {event.name}
          </ThemedText>
          <StatusBadge status={event.status} />
        </View>

        <ThemedText type="small" themeColor="textSecondary" style={styles.dates}>
          {t('event_detail.date_range', {
            start: new Date(event.start_at).toLocaleString(localeTag),
            end: new Date(event.end_at).toLocaleString(localeTag),
          })}
        </ThemedText>

        {event.description ? <ThemedText style={styles.description}>{event.description}</ThemedText> : null}

        {error ? (
          <ThemedText type="small" themeColor="destructive" style={styles.error}>
            {error}
          </ThemedText>
        ) : null}

        <View style={styles.actions}>
          {event.status === 'draft' ? (
            <Button title={t('manage_event.publish_button')} onPress={onPublish} loading={isUpdating} />
          ) : null}
          {event.status === 'draft' || event.status === 'published' ? (
            <Button
              title={t('manage_event.cancel_event_button')}
              variant="destructive"
              onPress={onCancel}
              loading={isUpdating}
            />
          ) : null}
        </View>

        <View style={styles.section}>
          <ThemedText type="subtitle" style={styles.managementTitle}>
            {t('manage_event.management_title')}
          </ThemedText>
          <View style={styles.managementActions}>
            <Button
              title={t('manage_event.orders_button')}
              variant="ghost"
              style={styles.managementButton}
              onPress={() =>
                router.push({
                  pathname: '/organizations/[orgId]/events/[eventId]/orders',
                  params: { orgId, eventId },
                })
              }
            />
            <Button
              title={t('manage_event.guest_list_button')}
              variant="ghost"
              style={styles.managementButton}
              onPress={() =>
                router.push({
                  pathname: '/organizations/[orgId]/events/[eventId]/guest-list',
                  params: { orgId, eventId },
                })
              }
            />
            <Button
              title={t('manage_event.check_in_button')}
              variant="ghost"
              style={styles.managementButton}
              onPress={() =>
                router.push({
                  pathname: '/organizations/[orgId]/events/[eventId]/check-in',
                  params: { orgId, eventId },
                })
              }
            />
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <ThemedText type="subtitle">{t('manage_event.ticket_types_title')}</ThemedText>
            {!showCreateForm ? (
              <Button
                title={t('manage_event.add_button')}
                onPress={() => setShowCreateForm(true)}
                style={styles.smallButton}
              />
            ) : null}
          </View>

          {showCreateForm ? (
            <View style={styles.createForm}>
              <TextField label={t('manage_event.ticket_name_label')} value={typeName} onChangeText={setTypeName} />
              <TextField
                label={t('manage_event.ticket_price_label')}
                value={typePrice}
                onChangeText={setTypePrice}
                keyboardType="decimal-pad"
              />
              <TextField
                label={t('manage_event.ticket_quantity_label')}
                value={typeQuantity}
                onChangeText={setTypeQuantity}
                keyboardType="number-pad"
              />
              <View style={styles.createActions}>
                <Button
                  title={t('manage_event.cancel_form_button')}
                  variant="ghost"
                  onPress={() => setShowCreateForm(false)}
                  style={styles.flexButton}
                />
                <Button
                  title={t('manage_event.create_type_button')}
                  onPress={onCreateTicketType}
                  loading={isCreatingType}
                  style={styles.flexButton}
                />
              </View>
            </View>
          ) : null}

          {ticketTypes.length === 0 ? (
            <ThemedText type="small" themeColor="textSecondary" style={styles.empty}>
              {t('manage_event.ticket_types_empty')}
            </ThemedText>
          ) : (
            ticketTypes.map((type) => (
              <ListItem
                key={type.id}
                title={type.name}
                subtitle={t('manage_event.sold_summary', {
                  price: formatPrice(type.price_cents, type.currency),
                  sold: type.quantity_sold,
                  total: type.quantity_total,
                })}
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
            <ThemedText type="subtitle">{t('manage_event.buy_tickets_title')}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary" style={styles.checkoutHint}>
              {t('manage_event.buy_tickets_hint')}
            </ThemedText>

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
                    ),
                  })}
                </ThemedText>

                {paymentError ? (
                  <ThemedText type="small" themeColor="destructive" style={styles.paymentNote}>
                    {paymentError}
                  </ThemedText>
                ) : null}

                {paymentSucceeded ? (
                  <>
                    <ThemedText type="smallBold" themeColor="success" style={styles.paymentNote}>
                      {t('event_detail.payment_succeeded')}
                    </ThemedText>
                    <Button
                      title={t('event_detail.view_tickets')}
                      variant="ghost"
                      style={styles.viewTicketsButton}
                      onPress={() =>
                        router.push({
                          pathname: '/organizations/[orgId]/events/[eventId]/tickets/[orderId]',
                          params: { orgId, eventId, orderId: checkoutResult.order.id },
                        })
                      }
                    />
                  </>
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
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: Spacing.three,
  },
  title: {
    flex: 1,
  },
  dates: {
    marginTop: Spacing.two,
  },
  description: {
    marginTop: Spacing.four,
  },
  error: {
    marginTop: Spacing.four,
  },
  actions: {
    marginTop: Spacing.five,
    gap: Spacing.two,
  },
  loader: {
    marginTop: Spacing.six,
  },
  section: {
    marginTop: Spacing.six,
  },
  managementTitle: {
    marginBottom: Spacing.three,
  },
  managementActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  managementButton: {
    paddingHorizontal: Spacing.three,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.three,
  },
  smallButton: {
    paddingHorizontal: Spacing.three,
  },
  createForm: {
    marginBottom: Spacing.four,
  },
  createActions: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  flexButton: {
    flex: 1,
  },
  empty: {
    textAlign: 'center',
    marginTop: Spacing.three,
  },
  checkoutHint: {
    marginTop: Spacing.one,
    marginBottom: Spacing.three,
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
