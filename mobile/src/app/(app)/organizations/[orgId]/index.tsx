import * as Location from 'expo-location';
import { useFocusEffect, useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Switch, View } from 'react-native';

import { Button } from '@/components/button';
import { DateTimeField } from '@/components/date-time-field';
import { ListItem } from '@/components/list-item';
import { StatusBadge } from '@/components/status-badge';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { ApiError, useAuth } from '@/lib/auth-context';
import { createEvent, generateEventDescription, listEvents, type Event } from '@/lib/events';
import { useTranslation } from '@/lib/i18n/context';
import { getOrganization } from '@/lib/organizations';

export default function OrganizationScreen() {
  const { orgId } = useLocalSearchParams<{ orgId: string }>();
  const { session } = useAuth();
  const router = useRouter();
  const navigation = useNavigation();
  const theme = useTheme();
  const { t, localeTag, locale } = useTranslation();

  const [events, setEvents] = useState<Event[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [name, setName] = useState('');
  const [startAt, setStartAt] = useState<string | null>(null);
  const [endAt, setEndAt] = useState<string | null>(null);
  const [address, setAddress] = useState('');
  const [description, setDescription] = useState('');
  const [descriptionAiGenerated, setDescriptionAiGenerated] = useState(false);
  const [coords, setCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const [isDiscoverable, setIsDiscoverable] = useState(false);

  const [showAiTone, setShowAiTone] = useState(false);
  const [aiTone, setAiTone] = useState('');
  const [isGeneratingAi, setIsGeneratingAi] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

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
      setError(t('organization_detail.load_error'));
    } finally {
      setIsLoading(false);
    }
  }, [session, orgId, navigation, t]);

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
      await createEvent(session.token, orgId, {
        name: name.trim(),
        start_at: startAt,
        end_at: endAt,
        ...(address.trim() ? { address: address.trim() } : {}),
        ...(description.trim()
          ? { description: description.trim(), description_ai_generated: descriptionAiGenerated }
          : {}),
        ...(coords ?? {}),
        is_public_discoverable: isDiscoverable,
      });
      setName('');
      setStartAt(null);
      setEndAt(null);
      setAddress('');
      setDescription('');
      setDescriptionAiGenerated(false);
      setShowAiTone(false);
      setAiTone('');
      setAiError(null);
      setCoords(null);
      setIsDiscoverable(false);
      setShowCreateForm(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('organization_detail.create_event_error'));
    } finally {
      setIsCreating(false);
    }
  }

  async function onGenerateDescription() {
    if (!session || !name.trim()) {
      setAiError(t('organization_detail.ai_name_required_error'));
      return;
    }
    setIsGeneratingAi(true);
    setAiError(null);
    try {
      const result = await generateEventDescription(session.token, orgId, {
        event_name: name.trim(),
        tone: aiTone.trim() || 'friendly and inviting',
        locale,
        ...(description.trim() ? { current_description: description.trim() } : {}),
      });
      setDescription(result.description);
      setDescriptionAiGenerated(true);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'ai_not_configured') {
        setAiError(t('organization_detail.ai_not_configured_error'));
      } else {
        setAiError(t('organization_detail.ai_generate_error'));
      }
    } finally {
      setIsGeneratingAi(false);
    }
  }

  async function onUseCurrentLocation() {
    setIsLocating(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      const position = await Location.getCurrentPositionAsync({});
      setCoords({ latitude: position.coords.latitude, longitude: position.coords.longitude });
    } finally {
      setIsLocating(false);
    }
  }

  return (
    <ThemedView style={styles.container}>
      <View style={styles.content}>
        <View style={styles.orgActions}>
          <Button
            title={t('organization_detail.members_button')}
            variant="ghost"
            style={styles.orgActionButton}
            onPress={() => router.push({ pathname: '/organizations/[orgId]/members', params: { orgId } })}
          />
          <Button
            title={t('organization_detail.dashboard_button')}
            variant="ghost"
            style={styles.orgActionButton}
            onPress={() => router.push({ pathname: '/organizations/[orgId]/dashboard', params: { orgId } })}
          />
          <Button
            title={t('organization_detail.quick_sale_button')}
            variant="ghost"
            style={styles.orgActionButton}
            onPress={() => router.push({ pathname: '/organizations/[orgId]/quick-sale', params: { orgId } })}
          />
        </View>

        {error ? (
          <ThemedText type="small" themeColor="destructive" style={styles.error}>
            {error}
          </ThemedText>
        ) : null}

        {showCreateForm ? (
          <View style={styles.createForm}>
            <TextField label={t('organization_detail.event_name_label')} value={name} onChangeText={setName} />
            <DateTimeField label={t('organization_detail.start_label')} onChange={setStartAt} />
            <View style={{ height: Spacing.three }} />
            <DateTimeField label={t('organization_detail.end_label')} onChange={setEndAt} />
            <TextField label={t('organization_detail.address_label')} value={address} onChangeText={setAddress} />
            <Button
              title={coords ? t('organization_detail.location_saved') : t('organization_detail.use_current_location')}
              variant="ghost"
              onPress={onUseCurrentLocation}
              loading={isLocating}
              style={styles.locationButton}
            />
            <TextField
              label={t('organization_detail.description_label')}
              value={description}
              onChangeText={(value) => {
                setDescription(value);
                setDescriptionAiGenerated(false);
              }}
              multiline
              numberOfLines={4}
            />
            {descriptionAiGenerated ? (
              <ThemedText type="small" themeColor="textSecondary" style={styles.aiNote}>
                {t('organization_detail.ai_generated_note')}
              </ThemedText>
            ) : null}
            {showAiTone ? (
              <View style={styles.aiToneBlock}>
                <TextField
                  label={t('organization_detail.ai_tone_label')}
                  value={aiTone}
                  onChangeText={setAiTone}
                />
                <Button
                  title={isGeneratingAi ? t('organization_detail.ai_generate_wait') : t('organization_detail.ai_generate_button')}
                  variant="ghost"
                  onPress={onGenerateDescription}
                  loading={isGeneratingAi}
                  style={styles.locationButton}
                />
              </View>
            ) : (
              <Button
                title={t('organization_detail.ai_toggle_button')}
                variant="ghost"
                onPress={() => setShowAiTone(true)}
                style={styles.locationButton}
              />
            )}
            {aiError ? (
              <ThemedText type="small" themeColor="destructive" style={styles.aiNote}>
                {aiError}
              </ThemedText>
            ) : null}
            <View style={styles.discoverableRow}>
              <View style={styles.discoverableText}>
                <ThemedText type="smallBold">{t('organization_detail.discoverable_title')}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {t('organization_detail.discoverable_subtitle')}
                </ThemedText>
              </View>
              <Switch
                value={isDiscoverable}
                onValueChange={setIsDiscoverable}
                trackColor={{ true: theme.primary, false: theme.border }}
              />
            </View>
            <View style={styles.createActions}>
              <Button
                title={t('organization_detail.cancel_button')}
                variant="ghost"
                onPress={() => setShowCreateForm(false)}
                style={styles.flexButton}
              />
              <Button
                title={t('organization_detail.create_button')}
                onPress={onCreate}
                loading={isCreating}
                disabled={!name.trim() || !startAt || !endAt}
                style={styles.flexButton}
              />
            </View>
          </View>
        ) : (
          <Button title={t('organization_detail.new_event_button')} onPress={() => setShowCreateForm(true)} />
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
                {t('organization_detail.empty')}
              </ThemedText>
            }
            renderItem={({ item }) => (
              <ListItem
                title={item.name}
                subtitle={new Date(item.start_at).toLocaleString(localeTag)}
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
  locationButton: {
    alignSelf: 'flex-start',
    paddingHorizontal: Spacing.three,
    marginBottom: Spacing.three,
  },
  aiNote: {
    marginTop: -Spacing.two,
    marginBottom: Spacing.three,
  },
  aiToneBlock: {
    marginBottom: Spacing.one,
  },
  discoverableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
    marginBottom: Spacing.four,
  },
  discoverableText: {
    flex: 1,
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
