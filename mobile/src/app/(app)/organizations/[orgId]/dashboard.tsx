import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth-context';
import {
  getOrganizationDashboard,
  listCapacityOvershootIncidents,
  type CapacityOvershootIncident,
  type EventDashboardEntry,
  type OrganizationDashboard,
} from '@/lib/dashboard';
import { formatPrice } from '@/lib/format';
import { useTranslation } from '@/lib/i18n/context';

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

// A late-paid order can push a ticket type's quantity_sold past its
// quantity_total ("payment always wins" — see the backend README's
// "Capacity overshoot" section). Rare, but when it happens the organizer
// needs to see it here rather than discover it at the door.
function CapacityWarning({ orgId, entry }: { orgId: string; entry: EventDashboardEntry }) {
  const { session } = useAuth();
  const { t } = useTranslation();
  const theme = useTheme();
  const [showDetails, setShowDetails] = useState(false);
  const [incidents, setIncidents] = useState<CapacityOvershootIncident[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  async function toggleDetails() {
    if (showDetails) {
      setShowDetails(false);
      return;
    }
    setShowDetails(true);
    if (incidents || loadError || !session) return;
    try {
      const result = await listCapacityOvershootIncidents(session.token, orgId, entry.event_id);
      setIncidents(result.items);
    } catch {
      setLoadError(t('org_dashboard.capacity_exceeded_load_error'));
    }
  }

  return (
    <View style={styles.capacityWarning}>
      <View style={styles.capacityWarningRow}>
        <Text style={[styles.badge, { color: theme.destructive, backgroundColor: theme.destructiveSoft }]}>
          {t('org_dashboard.capacity_exceeded_badge', { n: entry.capacity_overshoot_quantity })}
        </Text>
        <Button
          title={
            showDetails
              ? t('org_dashboard.capacity_exceeded_hide_details')
              : t('org_dashboard.capacity_exceeded_view_details')
          }
          variant="ghost"
          onPress={toggleDetails}
          style={styles.capacityWarningButton}
        />
      </View>
      {showDetails ? (
        loadError ? (
          <ThemedText type="small" themeColor="destructive">
            {loadError}
          </ThemedText>
        ) : incidents ? (
          incidents.map((incident) => (
            <ThemedText key={incident.id} type="small" themeColor="textSecondary" style={styles.incidentLine}>
              {t('org_dashboard.capacity_incident_line', {
                ticket_type: incident.ticket_type_name,
                order: incident.order_id,
                email: incident.buyer_email,
                sold: incident.quantity_sold,
                total: incident.quantity_total,
              })}
            </ThemedText>
          ))
        ) : (
          <ActivityIndicator size="small" />
        )
      ) : null}
    </View>
  );
}

function EventRow({ orgId, entry }: { orgId: string; entry: EventDashboardEntry }) {
  const { t } = useTranslation();
  return (
    <ThemedView type="backgroundElement" style={styles.eventCard}>
      <ThemedText type="smallBold">{entry.event_name}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {t('org_dashboard.orders_tickets_summary', {
          orders: entry.orders_paid_count,
          tickets: entry.tickets_sold,
        })}
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {t('org_dashboard.net_prefix', { amount: formatPrice(entry.net_revenue_cents, 'CAD') })}
      </ThemedText>
      {entry.capacity_overshoot_quantity > 0 ? <CapacityWarning orgId={orgId} entry={entry} /> : null}
    </ThemedView>
  );
}

export default function DashboardScreen() {
  const { orgId } = useLocalSearchParams<{ orgId: string }>();
  const { session } = useAuth();
  const { t } = useTranslation();

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
      setError(t('org_dashboard.load_error'));
    } finally {
      setIsLoading(false);
    }
  }, [session, orgId, t]);

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
          <Stat label={t('org_dashboard.tickets_sold')} value={String(dashboard.totals.tickets_sold)} />
          <Stat label={t('org_dashboard.orders_paid')} value={String(dashboard.totals.orders_paid_count)} />
          <Stat label={t('org_dashboard.net_revenue')} value={formatPrice(dashboard.totals.net_revenue_cents, 'CAD')} />
        </View>

        <ThemedText type="subtitle" style={styles.sectionTitle}>
          {t('org_dashboard.by_event')}
        </ThemedText>

        {dashboard.events.length === 0 ? (
          <ThemedText type="small" themeColor="textSecondary" style={styles.empty}>
            {t('org_dashboard.empty')}
          </ThemedText>
        ) : (
          dashboard.events.map((entry) => <EventRow key={entry.event_id} orgId={orgId} entry={entry} />)
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
  capacityWarning: {
    marginTop: Spacing.two,
    gap: 4,
  },
  capacityWarningRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  capacityWarningButton: {
    paddingVertical: 4,
    paddingHorizontal: Spacing.two,
  },
  incidentLine: {
    marginTop: 2,
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
