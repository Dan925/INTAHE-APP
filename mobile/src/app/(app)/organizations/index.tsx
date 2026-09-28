import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Switch, Text, View } from 'react-native';

import { Button } from '@/components/button';
import { ListItem } from '@/components/list-item';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth-context';
import { useTranslation } from '@/lib/i18n/context';
import { openLegalDocument } from '@/lib/legalLinks';
import { acceptInvite, listPendingInvites, type PendingInvite } from '@/lib/organizationMembers';
import { createOrganization, listOrganizations, type Organization } from '@/lib/organizations';

export default function OrganizationsScreen() {
  const { session } = useAuth();
  const router = useRouter();
  const { t } = useTranslation();
  const theme = useTheme();
  const ROLE_LABELS: Record<PendingInvite['role'], string> = {
    owner: t('roles.owner'),
    admin: t('roles.admin'),
    staff: t('roles.staff'),
    volunteer: t('roles.volunteer'),
  };
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [invites, setInvites] = useState<PendingInvite[]>([]);
  const [acceptingInviteId, setAcceptingInviteId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newOrgName, setNewOrgName] = useState('');
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [acceptOrganizerTerms, setAcceptOrganizerTerms] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!session) return;
    setIsLoading(true);
    try {
      const [orgsPage, invitesPage] = await Promise.all([
        listOrganizations(session.token),
        listPendingInvites(session.token),
      ]);
      setOrganizations(orgsPage.items);
      setInvites(invitesPage.items);
    } catch {
      setError(t('organizations_list.load_error'));
    } finally {
      setIsLoading(false);
    }
  }, [session, t]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function onCreate() {
    if (!session || !newOrgName.trim()) return;
    if (!acceptTerms || !acceptOrganizerTerms) {
      setError(t('organizations_list.accept_required_error'));
      return;
    }
    setIsCreating(true);
    setError(null);
    try {
      await createOrganization(session.token, {
        name: newOrgName.trim(),
        accept_terms: true,
        accept_organizer_terms: true,
      });
      setNewOrgName('');
      setAcceptTerms(false);
      setAcceptOrganizerTerms(false);
      setShowCreateForm(false);
      await load();
    } catch {
      setError(t('organizations_list.create_error'));
    } finally {
      setIsCreating(false);
    }
  }

  async function onAccept(invite: PendingInvite) {
    if (!session) return;
    setAcceptingInviteId(invite.id);
    setError(null);
    try {
      await acceptInvite(session.token, invite.organization_id);
      await load();
    } catch {
      setError(t('organizations_list.accept_error'));
    } finally {
      setAcceptingInviteId(null);
    }
  }

  return (
    <ThemedView style={styles.container}>
      <View style={styles.content}>
        <Button
          title={t('organizations_list.discover_button')}
          variant="ghost"
          onPress={() => router.push('/discover')}
          style={styles.discoverButton}
        />

        {error ? (
          <ThemedText type="small" themeColor="destructive" style={styles.error}>
            {error}
          </ThemedText>
        ) : null}

        {invites.length > 0 ? (
          <View style={styles.invites}>
            <ThemedText type="subtitle" style={styles.invitesTitle}>
              {t('organizations_list.pending_invites_title')}
            </ThemedText>
            {invites.map((invite) => (
              <ListItem
                key={invite.id}
                title={invite.organization_name}
                subtitle={ROLE_LABELS[invite.role]}
                right={
                  <Button
                    title={t('organizations_list.accept_button')}
                    style={styles.acceptButton}
                    loading={acceptingInviteId === invite.id}
                    onPress={() => onAccept(invite)}
                  />
                }
              />
            ))}
          </View>
        ) : null}

        {showCreateForm ? (
          <View style={styles.createForm}>
            <TextField label={t('organizations_list.org_name_label')} value={newOrgName} onChangeText={setNewOrgName} />

            <View style={styles.acceptRow}>
              <Switch value={acceptTerms} onValueChange={setAcceptTerms} trackColor={{ true: theme.primary, false: theme.border }} />
              <Text style={[styles.acceptText, { color: theme.textSecondary }]}>
                {t('organizations_list.accept_terms_prefix')}
                <Text style={{ color: theme.primary }} onPress={() => openLegalDocument('terms')}>
                  {t('organizations_list.accept_terms_link')}
                </Text>
              </Text>
            </View>
            <View style={styles.acceptRow}>
              <Switch
                value={acceptOrganizerTerms}
                onValueChange={setAcceptOrganizerTerms}
                trackColor={{ true: theme.primary, false: theme.border }}
              />
              <Text style={[styles.acceptText, { color: theme.textSecondary }]}>
                {t('organizations_list.accept_organizer_terms_prefix')}
                <Text style={{ color: theme.primary }} onPress={() => openLegalDocument('organizer-terms')}>
                  {t('organizations_list.accept_organizer_terms_link')}
                </Text>
              </Text>
            </View>

            <View style={styles.createActions}>
              <Button
                title={t('organizations_list.cancel_button')}
                variant="ghost"
                onPress={() => setShowCreateForm(false)}
                style={styles.flexButton}
              />
              <Button
                title={t('organizations_list.create_button')}
                onPress={onCreate}
                loading={isCreating}
                disabled={!newOrgName.trim() || !acceptTerms || !acceptOrganizerTerms}
                style={styles.flexButton}
              />
            </View>
          </View>
        ) : (
          <Button title={t('organizations_list.new_org_button')} onPress={() => setShowCreateForm(true)} />
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
                {t('organizations_list.empty')}
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
  discoverButton: {
    alignSelf: 'flex-start',
    paddingHorizontal: Spacing.three,
    marginBottom: Spacing.four,
  },
  error: {
    marginBottom: Spacing.three,
  },
  invites: {
    marginBottom: Spacing.five,
  },
  invitesTitle: {
    marginBottom: Spacing.three,
  },
  acceptButton: {
    paddingHorizontal: Spacing.three,
  },
  createForm: {
    marginBottom: Spacing.four,
  },
  acceptRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    marginTop: Spacing.two,
  },
  acceptText: {
    flex: 1,
    fontSize: 13,
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
