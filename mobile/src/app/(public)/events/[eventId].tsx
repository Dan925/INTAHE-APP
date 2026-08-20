import { useStripe } from '@stripe/stripe-react-native';
import { useFocusEffect, useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
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
import type { Event } from '@/lib/events';
import type { TicketType } from '@/lib/ticketTypes';

export default function PublicEventScreen() {
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const navigation = useNavigation();
  const router = useRouter();
  const { initPaymentSheet, presentPaymentSheet } = useStripe();

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
      setError("Impossible de charger l'événement.");
    } finally {
      setIsLoading(false);
    }
  }, [eventId, navigation]);

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
      setOrderError(err instanceof Error ? err.message : 'Impossible de créer la commande.');
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
          Du {new Date(event.start_at).toLocaleString('fr-CA')} au{' '}
          {new Date(event.end_at).toLocaleString('fr-CA')}
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
          <ThemedText type="subtitle">Billets</ThemedText>
          {ticketTypes.length === 0 ? (
            <ThemedText type="small" themeColor="textSecondary" style={styles.empty}>
              Aucun billet disponible pour l&apos;instant.
            </ThemedText>
          ) : (
            ticketTypes.map((type) => (
              <ListItem
                key={type.id}
                title={type.name}
                subtitle={`${formatPrice(type.price_cents, type.currency)} · ${type.quantity_total - type.quantity_sold} restant(s)`}
                onPress={() => setSelectedTypeId(type.id)}
                right={
                  selectedTypeId === type.id ? (
                    <ThemedText type="smallBold" themeColor="primary">
                      Sélectionné
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
                label="E-mail de l'acheteur"
                value={buyerEmail}
                onChangeText={setBuyerEmail}
                keyboardType="email-address"
                autoCapitalize="none"
              />
              <TextField label="Quantité" value={quantity} onChangeText={setQuantity} keyboardType="number-pad" />

              {orderError ? (
                <ThemedText type="small" themeColor="destructive" style={styles.error}>
                  {orderError}
                </ThemedText>
              ) : null}

              <Button
                title="Commander"
                onPress={onOrder}
                loading={isOrdering}
                disabled={!selectedTypeId || !buyerEmail.trim()}
              />
            </View>

            {checkoutResult ? (
              <ThemedView type="backgroundElement" style={styles.receipt}>
                <ThemedText type="smallBold">Commande créée</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  Total :{' '}
                  {formatPrice(
                    checkoutResult.order.total_cents,
                    ticketTypes.find((t) => t.id === selectedTypeId)?.currency ?? 'CAD',
                  )}
                </ThemedText>

                {paymentError ? (
                  <ThemedText type="small" themeColor="destructive" style={styles.paymentNote}>
                    {paymentError}
                  </ThemedText>
                ) : null}

                {paymentSucceeded ? (
                  <>
                    <ThemedText type="smallBold" themeColor="success" style={styles.paymentNote}>
                      Paiement réussi
                    </ThemedText>
                    <Button
                      title="Voir mes billets"
                      variant="ghost"
                      style={styles.viewTicketsButton}
                      onPress={() =>
                        router.push({
                          pathname: '/events/[eventId]/tickets/[orderId]',
                          params: { eventId, orderId: checkoutResult.order.id, buyerEmail },
                        })
                      }
                    />
                  </>
                ) : isPaymentReady ? (
                  <Button
                    title="Payer maintenant"
                    onPress={onPay}
                    loading={isPaying}
                    style={styles.viewTicketsButton}
                  />
                ) : (
                  <ThemedText type="small" themeColor="textSecondary">
                    Statut : {checkoutResult.order.status}
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
