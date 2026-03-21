const { onCall, HttpsError } = require('firebase-functions/v2/https');
const logger = require('firebase-functions/logger');
const admin = require('firebase-admin');
const { google } = require('googleapis');

admin.initializeApp();

const DEFAULT_CALENDAR_ID = 'stherplaygames@gmail.com';
const DEFAULT_TIMEZONE = 'America/Managua';

function buildCalendarAuth() {
  return new google.auth.GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/calendar'],
  });
}

function requireField(data, fieldName) {
  if (!data || !data[fieldName]) {
    throw new HttpsError('invalid-argument', `Missing required field: ${fieldName}`);
  }
  return data[fieldName];
}

exports.createCalendarEvent = onCall(
  {
    region: 'us-central1',
  },
  async (request) => {
    const data = request.data || {};
    const cliente = requireField(data, 'cliente');
    const plataforma = requireField(data, 'plataforma');
    const fecha = requireField(data, 'fecha');

    const calendarId = data.calendarId || process.env.CALENDAR_ID || DEFAULT_CALENDAR_ID;
    const timeZone = data.timeZone || process.env.CALENDAR_TIMEZONE || DEFAULT_TIMEZONE;
    const auth = buildCalendarAuth();
    const calendar = google.calendar({ version: 'v3', auth });

    const event = {
      summary: `Vence ${plataforma} - ${cliente}`,
      description: [
        `Cliente: ${cliente}`,
        `Plataforma: ${plataforma}`,
        data.subscriptionId ? `Suscripción: ${data.subscriptionId}` : null,
      ]
        .filter(Boolean)
        .join('\n'),
      start: {
        dateTime: fecha,
        timeZone,
      },
      end: {
        dateTime: data.fechaFin || fecha,
        timeZone,
      },
    };

    try {
      const response = await calendar.events.insert({
        calendarId,
        resource: event,
      });

      return {
        success: true,
        calendarId,
        eventId: response.data.id,
        htmlLink: response.data.htmlLink || '',
      };
    } catch (error) {
      logger.error('Error creating calendar event', error);
      throw new HttpsError('internal', 'Could not create calendar event');
    }
  }
);
