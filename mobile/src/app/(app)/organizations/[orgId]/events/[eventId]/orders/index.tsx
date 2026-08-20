import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet } from 'react-native';

import { ListItem } from '@/components/list-item';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth-context';
import { formatPrice } from '@/lib/format';
import { useTranslation } from '@/lib/i18n/context';
import { listOrdersForEvent, type Order } from '@/lib/orders';

export default function OrdersScreen() {
  const { orgId, eventId } = useLocalSearchParams<{ orgId: string; eventId: string }>();
  const { session } = useAuth();
  const { t } = useTranslation();

  const STATUS_LABELS: Record<string, string> = {
    pending: t('org_orders.status_pending'),
    paid: t('org_orders.status_paid'),
    refunded: t('org_orders.status_refunded'),
    partially_refunded: t('org_orders.status_partially_refunded'),
  };

  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!session) return;
    setIsLoading(true);
    try {
      const page = await listOrdersForEvent(session.token, orgId, eventId);
      setOrders(page.items);
    } catch {
      setError(t('org_orders.load_error'));
    } finally {
      setIsLoading(false);
    }
  }, [session, orgId, eventId, t]);

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
      {error ? (
        <ThemedText type="small" themeColor="destructive" style={styles.content}>
          {error}
        </ThemedText>
      ) : (
        <FlatList
          style={styles.content}
          data={orders}
          keyExtractor={(item) => item.id}
          ListEmptyComponent={
            <ThemedText type="small" themeColor="textSecondary" style={styles.empty}>
              {t('org_orders.empty')}
            </ThemedText>
          }
          renderItem={({ item }) => (
            <ListItem
              title={item.buyer_email}
              subtitle={`${formatPrice(item.total_cents, 'CAD')} · ${STATUS_LABELS[item.status] ?? item.status}`}
            />
          )}
        />
      )}
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
  empty: {
    textAlign: 'center',
    marginTop: Spacing.six,
  },
});
