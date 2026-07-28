import { useFocusEffect, useLocalSearchParams, useNavigation } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { StatusBadge } from '@/components/status-badge';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth-context';
import { cancelEvent, getEvent, publishEvent, type Event } from '@/lib/events';

export default function EventScreen() {
  const { orgId, eventId } = useLocalSearchParams<{ orgId: string; eventId: string }>();
  const { session } = useAuth();
  const navigation = useNavigation();

  const [event, setEvent] = useState<Event | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!session) return;
    setIsLoading(true);
    try {
      const result = await getEvent(session.token, orgId, eventId);
      setEvent(result.event);
      navigation.setOptions({ title: result.event.name });
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
});
