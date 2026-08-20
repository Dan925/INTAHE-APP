import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { ListItem } from '@/components/list-item';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { ApiError, useAuth } from '@/lib/auth-context';
import { useTranslation } from '@/lib/i18n/context';
import {
  inviteMember,
  listMembers,
  removeMember,
  updateMemberRole,
  type InvitableRole,
  type Member,
} from '@/lib/organizationMembers';

const NEXT_ROLE: Record<InvitableRole, InvitableRole> = {
  admin: 'staff',
  staff: 'volunteer',
  volunteer: 'admin',
};

export default function MembersScreen() {
  const { orgId } = useLocalSearchParams<{ orgId: string }>();
  const { session } = useAuth();
  const { t } = useTranslation();

  const ROLE_LABELS: Record<Member['role'], string> = {
    owner: t('roles.owner'),
    admin: t('roles.admin'),
    staff: t('roles.staff'),
    volunteer: t('roles.volunteer'),
  };

  const INVITE_ERROR_MESSAGES: Record<string, string> = {
    invitee_not_found: t('org_members.invite_error_not_found'),
    already_a_member: t('org_members.invite_error_already_member'),
    invite_already_pending: t('org_members.invite_error_already_pending'),
  };

  const [members, setMembers] = useState<Member[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<InvitableRole>('volunteer');
  const [isInviting, setIsInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!session) return;
    setIsLoading(true);
    try {
      const page = await listMembers(session.token, orgId);
      setMembers(page.items);
    } catch {
      setError(t('org_members.load_error'));
    } finally {
      setIsLoading(false);
    }
  }, [session, orgId, t]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function onInvite() {
    if (!session || !inviteEmail.trim()) return;
    setIsInviting(true);
    setInviteError(null);
    try {
      await inviteMember(session.token, orgId, { email: inviteEmail.trim().toLowerCase(), role: inviteRole });
      setInviteEmail('');
      await load();
    } catch (err) {
      if (err instanceof ApiError) {
        setInviteError(INVITE_ERROR_MESSAGES[err.code] ?? err.message);
      } else {
        setInviteError(t('org_members.invite_error_generic'));
      }
    } finally {
      setIsInviting(false);
    }
  }

  async function onCycleRole(member: Member) {
    if (!session || member.role === 'owner') return;
    try {
      await updateMemberRole(session.token, orgId, member.id, NEXT_ROLE[member.role]);
      await load();
    } catch {
      setError(t('org_members.role_update_error'));
    }
  }

  async function onRemove(member: Member) {
    if (!session || member.role === 'owner') return;
    try {
      await removeMember(session.token, orgId, member.id);
      await load();
    } catch {
      setError(t('org_members.remove_error'));
    }
  }

  return (
    <ThemedView style={styles.container}>
      <View style={styles.content}>
        <ThemedText type="subtitle">{t('org_members.invite_title')}</ThemedText>
        <View style={styles.inviteForm}>
          <TextField
            label={t('org_members.email_label')}
            value={inviteEmail}
            onChangeText={setInviteEmail}
            autoCapitalize="none"
            keyboardType="email-address"
          />
          <View style={styles.roleRow}>
            {(['admin', 'staff', 'volunteer'] as InvitableRole[]).map((role) => (
              <Button
                key={role}
                title={ROLE_LABELS[role]}
                variant={inviteRole === role ? 'primary' : 'ghost'}
                style={styles.roleButton}
                onPress={() => setInviteRole(role)}
              />
            ))}
          </View>
          {inviteError ? (
            <ThemedText type="small" themeColor="destructive" style={styles.inviteErrorText}>
              {inviteError}
            </ThemedText>
          ) : null}
          <Button
            title={t('org_members.invite_button')}
            onPress={onInvite}
            loading={isInviting}
            disabled={!inviteEmail.trim()}
          />
        </View>

        {error ? (
          <ThemedText type="small" themeColor="destructive" style={styles.error}>
            {error}
          </ThemedText>
        ) : null}

        {isLoading ? (
          <ActivityIndicator style={styles.loader} />
        ) : (
          <FlatList
            style={styles.list}
            data={members}
            keyExtractor={(item) => item.id}
            ListEmptyComponent={
              <ThemedText type="small" themeColor="textSecondary" style={styles.empty}>
                {t('org_members.empty')}
              </ThemedText>
            }
            renderItem={({ item }) => (
              <ListItem
                title={item.full_name}
                subtitle={`${item.email} · ${ROLE_LABELS[item.role]}${item.accepted_at ? '' : t('org_members.pending_invite_suffix')}`}
                right={
                  item.role === 'owner' ? undefined : (
                    <View style={styles.memberActions}>
                      <Button
                        title={t('org_members.change_role_button')}
                        variant="ghost"
                        style={styles.smallButton}
                        onPress={() => onCycleRole(item)}
                      />
                      <Button
                        title={t('org_members.remove_button')}
                        variant="destructive"
                        style={styles.smallButton}
                        onPress={() => onRemove(item)}
                      />
                    </View>
                  )
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
  inviteForm: {
    marginTop: Spacing.three,
    marginBottom: Spacing.five,
  },
  roleRow: {
    flexDirection: 'row',
    gap: Spacing.two,
    marginBottom: Spacing.three,
  },
  roleButton: {
    flex: 1,
    paddingHorizontal: Spacing.two,
  },
  inviteErrorText: {
    marginBottom: Spacing.two,
  },
  error: {
    marginBottom: Spacing.three,
  },
  loader: {
    marginTop: Spacing.six,
  },
  list: {
    flex: 1,
  },
  empty: {
    textAlign: 'center',
    marginTop: Spacing.six,
  },
  memberActions: {
    gap: Spacing.one,
    alignItems: 'flex-end',
  },
  smallButton: {
    paddingHorizontal: Spacing.two,
    paddingVertical: 2,
  },
});
