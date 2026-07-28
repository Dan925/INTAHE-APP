import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { TextField } from '@/components/text-field';
import { Spacing } from '@/constants/theme';

export interface DateTimeFieldProps {
  label: string;
  /** ISO 8601 datetime, or null while the typed value doesn't parse yet. */
  onChange: (isoDateTime: string | null) => void;
}

/**
 * A plain date + time text pair rather than a native picker: this project's
 * only way to verify a screen end-to-end right now is a headless browser,
 * and @react-native-community/datetimepicker has no web implementation.
 * Swap this for a native picker once testing on a real device is possible.
 */
export function DateTimeField({ label, onChange }: DateTimeFieldProps) {
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');

  function update(nextDate: string, nextTime: string) {
    setDate(nextDate);
    setTime(nextTime);
    const parsed = new Date(`${nextDate}T${nextTime || '00:00'}:00`);
    onChange(Number.isNaN(parsed.getTime()) ? null : parsed.toISOString());
  }

  return (
    <View>
      <View style={styles.row}>
        <View style={styles.dateInput}>
          <TextField
            label={`${label} — date (AAAA-MM-JJ)`}
            value={date}
            onChangeText={(v) => update(v, time)}
            placeholder="2026-08-01"
            autoCapitalize="none"
          />
        </View>
        <View style={styles.timeInput}>
          <TextField
            label="Heure (HH:mm)"
            value={time}
            onChangeText={(v) => update(date, v)}
            placeholder="20:00"
            autoCapitalize="none"
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  dateInput: {
    flex: 2,
  },
  timeInput: {
    flex: 1,
  },
});
