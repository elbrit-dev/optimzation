import * as Sentry from '@sentry/nextjs';
import app from '../firebase';

/* Every Sentry error, trace and replay carries who was signed in, so in Sentry
   `user.email:someone@elbrit.org` finds what that person ran into — the same
   search the ERP's own Sentry projects answer for their side.

   Firebase Auth is the sign-in: its user is null for the first moments after a
   cold start (see components/PwaBackGuard.jsx), then arrives here; signing out
   clears it. Harmless when Sentry is off (no DSN).

   Field staff sign in with their phone number, so Firebase has no email for
   them: the number becomes the username (`user.username:+9198...`). The
   calendar adds the ERP employee as tags (employee, employee.name,
   employee.login) once it knows them; see shared/calendar/lib/sentryEmployee.js. */
export function followSignedInUser() {
  app.auth().onAuthStateChanged((user) => {
    Sentry.setUser(
      user
        ? {
            id: user.uid,
            email: user.email || undefined,
            username: user.displayName || user.phoneNumber || undefined,
          }
        : null
    );
  });
}
