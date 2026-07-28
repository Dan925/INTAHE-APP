import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { ListItem } from '@/components/list-item';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth-context';
import { createOrganization, listOrganizations, type Organization } from '@/lib/organizations';

export default function OrganizationsScreen() {
  const { session } = useAuth();
  const router = useRouter();
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newOrgName, setNewOrgName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!session) return;
    setIsLoading(true);
    try {
      const page = await listOrganizations(session.token);
      setOrganizations(page.items);
    } catch {
      setError('Impossible de charger les organisations.');
    } finally {
      setIsLoading(false);
    }
  }, [session]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function onCreate() {
    if (!session || !newOrgName.trim()) return;
    setIsCreating(true);
    setError(null);
    try {
      await createOrganization(session.token, { name: newOrgName.trim() });
      setNewOrgName('');
      setShowCreateForm(false);
      await load();
    } catch {
      setError("Impossible de créer l'organisation.");
    } finally {
      setIsCreating(false);
    }
  }

  return (
    <ThemedView style={styles.container}>
      <View style={styles.content}>
        {error ? (
          <ThemedText type="small" themeColor="destructive" style={styles.error}>
            {error}
          </ThemedText>
        ) : null}

        {showCreateForm ? (
          <View style={styles.createForm}>
            <TextField label="Nom de l'organisation" value={newOrgName} onChangeText={setNewOrgName} />
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
                disabled={!newOrgName.trim()}
                style={styles.flexButton}
              />
            </View>
          </View>
        ) : (
          <Button title="Nouvelle organisation" onPress={() => setShowCreateForm(true)} />
        )}

        {isLoading ? (
          <ActivityIndicator style={styles.loader} />
        ) : (
          <FlatList
            style={styles.list}
            data={organizations}
            keyExtractor={(item) => item.id}
            ListEmptyComponent={
              <ThemedText type="small" themeColor="textSecondary" style={styles.empty}>
                Aucune organisation pour l'instant.
              </ThemedText>
            }
            renderItem={({ item }) => (
              <ListItem
                title={item.name}
                subtitle={item.slug}
                onPress={() =>
                  router.push({ pathname: '/organizations/[orgId]', params: { orgId: item.id } })
                }
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
