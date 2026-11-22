import { describe, expect, it } from 'vitest';
import { calendarTemplate, mapsDirections, mapsSearch, webSearch, safeExternalLink } from './externalLinks';
describe('external links', () => {
  it('encodes a Japanese destination', () => {
    const x=mapsDirections('東京駅 丸の内');expect(x).toContain('api=1');expect(new URL(x!).searchParams.get('destination')).toBe('東京駅 丸の内');
  });
  it('preserves typed Japanese search terms', () => {
    expect(new URL(webSearch('京都 紅葉 穴場')!).searchParams.get('q')).toBe('京都 紅葉 穴場');
  });
  it('ends one-day events on next day EXCLUSIVELY, including leap day', () => {
    const u=calendarTemplate({title:'試験',startDate:'2028-02-29',endDate:'2028-02-29',allDay:true});
    expect(new URL(u!).searchParams.get('dates')).toBe('20280229/20280301');
  });
  it('specifies JST for a timed event', () => {
    const u=calendarTemplate({title:'予定',startDate:'2026-11-22',endDate:'2026-11-22',allDay:false,startTime:'09:00',endTime:'10:30'});
    expect(new URL(u!).searchParams.get('dates')).toBe('20261122T090000/20261122T103000');
    expect(new URL(u!).searchParams.get('ctz')).toBe('Asia/Tokyo');
  });
  it('does not create invalid time/date links', () => {
    expect(calendarTemplate({title:'x',startDate:'2026-02-30',endDate:'2026-03-01',allDay:true})).toBeNull();
    expect(calendarTemplate({title:'x',startDate:'2026-11-22',endDate:'2026-11-22',allDay:false,startTime:'18:00',endTime:'17:00'})).toBeNull();
  });
  it('rejects javascript: links and blank maps searches', () => {
    expect(safeExternalLink('javascript:alert(1)')).toBeNull();expect(mapsSearch(' ')).toBeNull();
  });
});
