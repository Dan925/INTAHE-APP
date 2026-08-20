import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radius, Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth-context';
import { getOrganizationDashboard, type EventDashboardEntry, type OrganizationDashboard } from '@/lib/dashboard';
import { formatPrice } from '@/lib/format';

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
      <ThemedText type="subtitle">{value}</ThemedText>
    </View>
  );
}

function EventRow({ entry }: { entry: EventDashboardEntry }) {
  return (
    <ThemedView type="backgroundElement" style={styles.eventCard}>
      <ThemedText type="smallBold">{entry.event_name}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {entry.orders_paid_count} commandes · {entry.tickets_sold} billets
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        Net : {formatPrice(entry.net_revenue_cents, 'CAD')}
      </ThemedText>
    </ThemedView>
  );
}

export default function DashboardScreen() {
  const { orgId } = useLocalSearchParams<{ orgId: string }>();
  const { session } = useAuth();

  const [dashboard, setDashboard] = useState<OrganizationDashboard | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!session) return;
    setIsLoading(true);
    setError(null);
    try {
      const result = await getOrganizationDashboard(session.token, orgId);
      setDashboard(result);
    } catch {
      setError('Impossible de charger le dashboard.');
    } finally {
      setIsLoading(false);
    }
  }, [session, orgId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  if (isLoading || !dashboard) {
    return (
      <ThemedView style={styles.container}>
        {error ? (
          <ThemedText type="small" themeColor="destructive" style={styles.content}>
            {error}
          </ThemedText>
        ) : (
          <ActivityIndicator style={styles.loader} />
        )}
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.statsRow}>
          <Stat label="Billets vendus" value={String(dashboard.totals.tickets_sold)} />
          <Stat label="Commandes payées" value={String(dashboard.totals.orders_paid_count)} />
          <Stat label="Revenu net" value={formatPrice(dashboard.totals.net_revenue_cents, 'CAD')} />
        </View>

        <ThemedText type="subtitle" style={styles.sectionTitle}>
          Par événement
        </ThemedText>

        {dashboard.events.length === 0 ? (
          <ThemedText type="small" themeColor="textSecondary" style={styles.empty}>
            Aucun événement pour l&apos;instant.
          </ThemedText>
        ) : (
          dashboard.events.map((entry) => <EventRow key={entry.event_id} entry={entry} />)
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
  },
  loader: {
    marginTop: Spacing.six,
  },
  statsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.three,
    marginBottom: Spacing.five,
  },
  stat: {
    flexGrow: 1,
    minWidth: 120,
  },
  sectionTitle: {
    marginBottom: Spacing.three,
  },
  eventCard: {
    borderRadius: Radius.medium,
    padding: Spacing.three,
    marginBottom: Spacing.two,
    gap: 2,
  },
  empty: {
    textAlign: 'center',
    marginTop: Spacing.six,
  },
});
