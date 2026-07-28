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
import { createTicketType, listTicketTypes, type TicketType } from '@/lib/ticketTypes';

export default function EventScreen() {
  const { orgId, eventId } = useLocalSearchParams<{ orgId: string; eventId: string }>();
  const { session } = useAuth();
  const navigation = useNavigation();
  const router = useRouter();

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
      setError("Impossible de charger l'événement.");
    } finally {
      setIsLoading(false);
    }
  }, [session, orgId, eventId, navigation]);

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
      setError(err instanceof Error ? err.message : 'Action impossible.');
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
      setError(err instanceof Error ? err.message : 'Action impossible.');
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
        currency: 'eur',
      });
      setTypeName('');
      setTypePrice('');
      setTypeQuantity('');
      setShowCreateForm(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossible de créer ce type de billet.');
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
    try {
      const result = await createOrder(session?.token ?? null, eventId, {
        buyer_email: buyerEmail.trim(),
        line_items: [{ ticket_type_id: selectedTypeId, quantity: parsedQuantity }],
      });
      setCheckoutResult(result);
    } catch (err) {
      setOrderError(err instanceof Error ? err.message : 'Impossible de créer la commande.');
    } finally {
      setIsOrdering(false);
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
          Du {new Date(event.start_at).toLocaleString()} au {new Date(event.end_at).toLocaleString()}
        </ThemedText>

        {event.description ? <ThemedText style={styles.description}>{event.description}</ThemedText> : null}

        {error ? (
          <ThemedText type="small" themeColor="destructive" style={styles.error}>
            {error}
          </ThemedText>
        ) : null}

        <View style={styles.actions}>
          {event.status === 'draft' ? (
            <Button title="Publier l'événement" onPress={onPublish} loading={isUpdating} />
          ) : null}
          {event.status === 'draft' || event.status === 'published' ? (
            <Button title="Annuler l'événement" variant="destructive" onPress={onCancel} loading={isUpdating} />
          ) : null}
        </View>

        <View style={styles.section}>
          <ThemedText type="subtitle" style={styles.managementTitle}>
            Gestion
          </ThemedText>
          <View style={styles.managementActions}>
            <Button
              title="Commandes"
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
              title="Liste des invités"
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
              title="Check-in"
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
            <ThemedText type="subtitle">Types de billets</ThemedText>
            {!showCreateForm ? (
              <Button title="Ajouter" onPress={() => setShowCreateForm(true)} style={styles.smallButton} />
            ) : null}
          </View>

          {showCreateForm ? (
            <View style={styles.createForm}>
              <TextField label="Nom" value={typeName} onChangeText={setTypeName} />
              <TextField
                label="Prix (EUR)"
                value={typePrice}
                onChangeText={setTypePrice}
                keyboardType="decimal-pad"
              />
              <TextField
                label="Quantité disponible"
                value={typeQuantity}
                onChangeText={setTypeQuantity}
                keyboardType="number-pad"
              />
              <View style={styles.createActions}>
                <Button
                  title="Annuler"
                  variant="ghost"
                  onPress={() => setShowCreateForm(false)}
                  style={styles.flexButton}
                />
                <Button
                  title="Créer"
                  onPress={onCreateTicketType}
                  loading={isCreatingType}
                  style={styles.flexButton}
                />
              </View>
            </View>
          ) : null}

          {ticketTypes.length === 0 ? (
            <ThemedText type="small" themeColor="textSecondary" style={styles.empty}>
              Aucun type de billet pour l'instant.
            </ThemedText>
          ) : (
            ticketTypes.map((type) => (
              <ListItem
                key={type.id}
                title={type.name}
                subtitle={`${formatPrice(type.price_cents, type.currency)} · ${type.quantity_sold}/${type.quantity_total} vendus`}
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
            <ThemedText type="subtitle">Acheter des billets</ThemedText>
            <ThemedText type="small" themeColor="textSecondary" style={styles.checkoutHint}>
              Choisissez un type de billet ci-dessus, puis renseignez vos informations pour créer la commande.
            </ThemedText>

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
                  Total : {formatPrice(
                    checkoutResult.order.total_cents,
                    ticketTypes.find((t) => t.id === selectedTypeId)?.currency ?? 'EUR',
                  )}
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  Statut : {checkoutResult.order.status}
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary" style={styles.paymentNote}>
                  Le paiement par carte (Stripe) n'est pas encore branché dans l'app mobile — cette étape
                  nécessite un appareil ou simulateur réel pour être testée et sera ajoutée ensuite. Les billets
                  (QR codes) ne seront disponibles qu'une fois le paiement confirmé.
                </ThemedText>
                <Button
                  title="Voir mes billets"
                  variant="ghost"
                  style={styles.viewTicketsButton}
                  onPress={() =>
                    router.push({
                      pathname: '/organizations/[orgId]/events/[eventId]/tickets/[orderId]',
                      params: { orgId, eventId, orderId: checkoutResult.order.id },
                    })
                  }
                />
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
