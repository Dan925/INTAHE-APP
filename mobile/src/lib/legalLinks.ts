import { Linking } from 'react-native';
import { BASE_URL } from '@/lib/api';

export type LegalDocumentSlug = 'terms' | 'organizer-terms' | 'refund-policy' | 'privacy' | 'acceptable-use';

// The app has no in-app renderer for these — they're server-rendered HTML
// pages (src/web/routes.ts's /legal/* routes), so the only place to show
// them from the mobile app is the device browser.
export function openLegalDocument(slug: LegalDocumentSlug): void {
  Linking.openURL(`${BASE_URL}/legal/${slug}`);
}
