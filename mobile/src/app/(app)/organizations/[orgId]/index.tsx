import { useFocusEffect, useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { DateTimeField } from '@/components/date-time-field';
import { ListItem } from '@/components/list-item';
import { StatusBadge } from '@/components/status-badge';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth-context';
import { createEvent, listEvents, type Event } from '@/lib/events';
import { getOrganization } from '@/lib/organizations';

export default function OrganizationScreen() {
  const { orgId } = useLocalSearchParams<{ orgId: string }>();
  const { session } = useAuth();
  const router = useRouter();
  const navigation = useNavigation();

  const [events, setEvents] = useState<Event[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [name, setName] = useState('');
  const [startAt, setStartAt] = useState<string | null>(null);
  const [endAt, setEndAt] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!session) return;
    setIsLoading(true);
    try {
      const [orgResult, eventsResult] = await Promise.all([
        getOrganization(session.token, orgId),
        listEvents(session.token, orgId),
      ]);
      navigation.setOptions({ title: orgResult.organization.name });
      setEvents(eventsResult.items);
    } catch {
      setError('Impossible de charger cette organisation.');
    } finally {
      setIsLoading(false);
    }
  }, [session, orgId, navigation]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function onCreate() {
    if (!session || !name.trim() || !startAt || !endAt) return;
    setIsCreating(true);
    setError(null);
    try {
      await createEvent(session.token, orgId, { name: name.trim(), start_at: startAt, end_at: endAt });
      setName('');
      setStartAt(null);
      setEndAt(null);
      setShowCreateForm(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Impossible de créer l'événement.");
    } finally {
      setIsCreating(false);
    }
  }

  return (
    <ThemedView style={styles.container}>
      <View style={styles.content}>
        <View style={styles.orgActions}>
          <Button
            title="Membres"
            variant="ghost"
            style={styles.orgActionButton}
            onPress={() => router.push({ pathname: '/organizations/[orgId]/members', params: { orgId } })}
          />
          <Button
            title="Dashboard"
            variant="ghost"
            style={styles.orgActionButton}
            onPress={() => router.push({ pathname: '/organizations/[orgId]/dashboard', params: { orgId } })}
          />
        </View>

        {error ? (
          <ThemedText type="small" themeColor="destructive" style={styles.error}>
            {error}
          </ThemedText>
        ) : null}

        {showCreateForm ? (
          <View style={styles.createForm}>
            <TextField label="Nom de l'événement" value={name} onChangeText={setName} />
            <DateTimeField label="Début" onChange={setStartAt} />
            <View style={{ height: Spacing.three }} />
            <DateTimeField label="Fin" onChange={setEndAt} />
            <View style={styles.createActions}>
              <Button
                title="Annuler"
                variant="ghost"
                onPress={() => setShowCreateForm(false)}
                style={styles.flexButton}
              />
              <Button
                title="Créer"
                onPress={onCreate}
                loading={isCreating}
                disabled={!name.trim() || !startAt || !endAt}
                style={styles.flexButton}
              />
            </View>
          </View>
        ) : (
          <Button title="Nouvel événement" onPress={() => setShowCreateForm(true)} />
        )}

        {isLoading ? (
          <ActivityIndicator style={styles.loader} />
        ) : (
          <FlatList
            style={styles.list}
            data={events}
            keyExtractor={(item) => item.id}
            ListEmptyComponent={
              <ThemedText type="small" themeColor="textSecondary" style={styles.empty}>
                Aucun événement pour l&apos;instant.
              </ThemedText>
            }
            renderItem={({ item }) => (
              <ListItem
                title={item.name}
                subtitle={new Date(item.start_at).toLocaleString()}
                onPress={() =>
                  router.push({
                    pathname: '/organizations/[orgId]/events/[eventId]',
                    params: { orgId, eventId: item.id },
                  })
                }
                right={<StatusBadge status={item.status} />}
              />
            )}
          />
        )}
      </View>
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
  orgActions: {
    flexDirection: 'row',
    gap: Spacing.two,
    marginBottom: Spacing.four,
  },
  orgActionButton: {
    paddingHorizontal: Spacing.three,
  },
  error: {
    marginBottom: Spacing.three,
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
  loader: {
    marginTop: Spacing.six,
  },
  list: {
    marginTop: Spacing.four,
  },
  empty: {
    textAlign: 'center',
    marginTop: Spacing.six,
  },
});
