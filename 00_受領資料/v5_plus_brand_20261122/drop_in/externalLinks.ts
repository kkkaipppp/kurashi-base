/** Reference-only utility; adapt into the actual Next.js project after diff review. */
function validDay(s: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T12:00:00Z`);
  return !Number.isNaN(d.valueOf()) && d.toISOString().slice(0, 10) === s;
}
function nextDay(s: string) {
  const d = new Date(`${s}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}
function compact(s: string) { return s.replaceAll('-', '').replaceAll(':', ''); }
export function safeExternalLink(href: string): string | null {
  try {
    const u = new URL(href);
    return (u.protocol === 'https:' || u.protocol === 'http:') ? u.toString() : null;
  } catch { return null; }
}
export function mapsDirections(destination: string, travelmode: 'walking' | 'driving' | 'transit' = 'transit'): string | null {
  if (!destination.trim()) return null;
  const u = new URL('https://www.google.com/maps/dir/');
  u.searchParams.set('api','1');u.searchParams.set('destination',destination.trim());u.searchParams.set('travelmode',travelmode);
  return u.toString();
}
export function mapsSearch(query: string): string | null {
  if (!query.trim()) return null;
  const u = new URL('https://www.google.com/maps/search/');
  u.searchParams.set('api','1');u.searchParams.set('query',query.trim());return u.toString();
}
export function webSearch(query: string): string | null {
  if (!query.trim()) return null;
  const u = new URL('https://www.google.com/search');u.searchParams.set('q',query.trim());return u.toString();
}
export function calendarTemplate(e: { title:string;startDate:string;endDate:string;allDay:boolean;startTime?:string;endTime?:string;description?:string;location?:string; }): string | null {
  if (!e.title.trim() || !validDay(e.startDate) || !validDay(e.endDate) || e.endDate < e.startDate) return null;
  const u = new URL('https://calendar.google.com/calendar/render');
  u.searchParams.set('action','TEMPLATE');u.searchParams.set('text',e.title.trim());
  if (e.allDay) {
    u.searchParams.set('dates',compact(e.startDate)+'/'+compact(nextDay(e.endDate)));
  } else {
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(e.startTime??'') || !/^([01]\d|2[0-3]):[0-5]\d$/.test(e.endTime??'')) return null;
    const st=e.startDate+'T'+e.startTime;const ed=e.endDate+'T'+e.endTime;
    if(ed<=st) return null;
    u.searchParams.set('dates',compact(st)+'00/'+compact(ed)+'00');u.searchParams.set('ctz','Asia/Tokyo');
  }
  if(e.description?.trim())u.searchParams.set('details',e.description.trim());
  if(e.location?.trim())u.searchParams.set('location',e.location.trim());
  return u.toString();
}
