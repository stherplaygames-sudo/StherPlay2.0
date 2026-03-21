import { getFunctions, httpsCallable } from 'firebase/functions';
import { app } from '../firebase/firebaseConfig.js';

const functions = getFunctions(app);

export async function createCalendarEvent(payload) {
  const callable = httpsCallable(functions, 'createCalendarEvent');
  const result = await callable(payload);
  return result.data;
}

export async function createEvent(payload) {
  return createCalendarEvent(payload);
}

window.calendarService = {
  createCalendarEvent,
  createEvent,
};
window.createEvent = createEvent;
