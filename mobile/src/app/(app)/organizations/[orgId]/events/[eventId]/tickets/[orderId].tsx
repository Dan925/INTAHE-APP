import { Image } from 'expo-image';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radius, Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth-context';
import { listTicketsForOrder, type BuyerTicket } from '@/lib/tickets';

export default function OrderTicketsScreen() {
  const { eventId, orderId } = useLocalSearchParams<{ eventId: string; orderId: string }>();
  const { session } = useAuth();

  const [tickets, setTickets] = useState<BuyerTicket[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await listTicketsForOrder(session?.token ?? null, eventId, orderId);
      setTickets(result.items);
    } catch {
      setError(
        "Impossible de charger les billets. Le paiement n'a peut-être pas encore été confirmé.",
      );
    } finally {
      setIsLoading(false);
    }
  }, [session, eventId, orderId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  if (isLoading) {
    return (
      <ThemedView style={styles.container}>
        <ActivityIndicator style={styles.loader} />
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        {error ? (
          <ThemedText type="small" themeColor="destructive">
            {error}
          </ThemedText>
        ) : tickets.length === 0 ? (
          <ThemedText type="small" themeColor="textSecondary">
            Aucun billet pour cette commande pour l&apos;instant.
          </ThemedText>
        ) : (
          tickets.map((ticket) => (
            <ThemedView key={ticket.id} type="backgroundElement" style={styles.card}>
              <ThemedText type="smallBold">{ticket.ticket_type_name}</ThemedText>
              <Image source={{ uri: ticket.qr_code_image }} style={styles.qr} contentFit="contain" />
              <ThemedText type="code" themeColor="textSecondary" selectable style={styles.code}>
                {ticket.qr_code}
              </ThemedText>
              <View style={styles.statusRow}>
                <ThemedText
                  type="small"
                  themeColor={ticket.checked_in_at ? 'success' : 'textSecondary'}>
                  {ticket.checked_in_at ? 'Scanné' : "Pas encore scanné"}
                </ThemedText>
              </View>
            </ThemedView>
          ))
        )}
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
    gap: Spacing.three,
  },
  loader: {
    marginTop: Spacing.six,
  },
  card: {
    borderRadius: Radius.medium,
    padding: Spacing.four,
    alignItems: 'center',
    gap: Spacing.two,
  },
  qr: {
    width: 200,
    height: 200,
  },
  code: {
    textAlign: 'center',
  },
  statusRow: {
    marginTop: Spacing.one,
  },
});
