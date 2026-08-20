import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { ListItem } from '@/components/list-item';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { listDiscoverableEvents, type DiscoverableEvent } from '@/lib/discover';

export default function DiscoverScreen() {
  const router = useRouter();

  const [events, setEvents] = useState<DiscoverableEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLocating, setIsLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (location?: { latitude: number; longitude: number }) => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await listDiscoverableEvents(location);
      setEvents(result.items);
    } catch {
      setError('Impossible de charger les événements.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function onUseCurrentLocation() {
    setIsLocating(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setError('Position refusée — les événements sont affichés par date.');
        return;
      }
      const position = await Location.getCurrentPositionAsync({});
      await load({ latitude: position.coords.latitude, longitude: position.coords.longitude });
    } finally {
      setIsLocating(false);
    }
  }

  return (
    <ThemedView style={styles.container}>
      <View style={styles.content}>
        <Button
          title="Utiliser ma position"
          variant="ghost"
          onPress={onUseCurrentLocation}
          loading={isLocating}
          style={styles.locateButton}
        />

        {error ? (
          <ThemedText type="small" themeColor="destructive" style={styles.error}>
            {error}
          </ThemedText>
        ) : null}

        {isLoading ? (
          <ActivityIndicator style={styles.loader} />
        ) : (
          <FlatList
            data={events}
            keyExtractor={(item) => item.id}
            ListEmptyComponent={
              <ThemedText type="small" themeColor="textSecondary" style={styles.empty}>
                Aucun événement découvrable pour l&apos;instant.
              </ThemedText>
            }
            renderItem={({ item }) => (
              <ListItem
                title={item.name}
                subtitle={
                  new Date(item.start_at).toLocaleString('fr-CA') +
                  (item.distance_km !== null ? ` · ${item.distance_km.toFixed(1)} km` : '') +
                  (item.address ? ` · ${item.address}` : '')
                }
                onPress={() => router.push({ pathname: '/events/[eventId]', params: { eventId: item.id } })}
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
  locateButton: {
    alignSelf: 'flex-start',
    paddingHorizontal: Spacing.three,
    marginBottom: Spacing.four,
  },
  error: {
    marginBottom: Spacing.three,
  },
  loader: {
    marginTop: Spacing.six,
  },
  empty: {
    textAlign: 'center',
    marginTop: Spacing.six,
  },
});
