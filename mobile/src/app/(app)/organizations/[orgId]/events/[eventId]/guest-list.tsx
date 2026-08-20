import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet } from 'react-native';

import { ListItem } from '@/components/list-item';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth-context';
import { listGuestList, type GuestListEntry } from '@/lib/checkin';
import { useTranslation } from '@/lib/i18n/context';

export default function GuestListScreen() {
  const { orgId, eventId } = useLocalSearchParams<{ orgId: string; eventId: string }>();
  const { session } = useAuth();
  const { t } = useTranslation();

  const [entries, setEntries] = useState<GuestListEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!session) return;
    setIsLoading(true);
    try {
      const page = await listGuestList(session.token, orgId, eventId);
      setEntries(page.items);
    } catch {
      setError(t('guest_list.load_error'));
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
          data={entries}
          keyExtractor={(item) => item.id}
          ListEmptyComponent={
            <ThemedText type="small" themeColor="textSecondary" style={styles.empty}>
              {t('guest_list.empty')}
            </ThemedText>
          }
          renderItem={({ item }) => (
            <ListItem
              title={item.attendee_name ?? item.buyer_email}
              subtitle={item.ticket_type_name}
              right={
                <ThemedText type="small" themeColor={item.checked_in_at ? 'success' : 'textSecondary'}>
                  {item.checked_in_at ? t('guest_list.scanned') : t('guest_list.pending')}
                </ThemedText>
              }
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
