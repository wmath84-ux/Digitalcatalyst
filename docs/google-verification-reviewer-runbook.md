# Google OAuth verification reviewer runbook

This runbook is intentionally credential-free. Replace the angle-bracket
placeholders only when sending the private reply to Google Trust and Safety;
do not commit passwords, one-time codes, refresh tokens or reviewer credentials
to this repository.

## Production links

- **Homepage:** https://eduvora.shop/
- **Login:** https://eduvora.shop/#/auth
- **Privacy policy:** https://eduvora.shop/privacy-policy.html
- **Google-data section:** https://eduvora.shop/privacy-policy.html#google-data
- **Terms:** https://eduvora.shop/terms-of-service.html
- **Demo video:** `<PRIVATE_OR_UNLISTED_VIDEO_URL>` (record and upload outside this repository)

The homepage identifies **Eduvora | Digital Catalyst**, describes the learning
service, and links to the same privacy-policy URL above. The public app uses
Firebase Google Sign-In for basic identity only. It does not request learner
Google Drive, Gmail, Calendar or other Workspace API access.

## Reviewer navigation

1. Open the homepage and confirm the Eduvora branding, learning-service
   description, footer disclosure and Privacy Policy link.
2. Open **Continue with Google** / the login link. Complete the Google consent
   screen with the authorized reviewer account supplied privately in the email
   reply. The requested sign-in information is basic account identity only;
   there is no Drive permission to approve.
3. After sign-in, open **Home** and select the reviewer course supplied in the
   account. Open a module and choose a Google Docs, Sheets or Slides resource.
   The resource opens in the Course Player; the app uses the file's existing
   sharing/edit permission and does not ask the learner to authorize Drive.
4. In the Player panel, open **Gate personal access** for an eligible Google
   resource. Enter the authorized reviewer email (or the email Google has
   approved for the test account), confirm the request, and wait for the
   operator-side Drive share/invite result. No learner Drive OAuth popup should
   appear.
5. Open the Privacy Policy from the gate or footer and show the `#google-data`
   section. It explains identity data, the owner-controlled Apps Script/Drive
   workflow, recipients, protection, retention/deletion and user controls.

If the reviewer account has no course entitlement, use the allowlisted test
course/account identified in the private reply instead of making up credentials.

## OAuth/Google-data proof points for the recording

The video should show the same branded production app from start to finish:

1. Homepage branding and functionality beyond login.
2. The complete Google consent flow for the production Firebase sign-in client.
3. The granted identity-only sign-in access (basic `openid`, `email` and
   `profile` identity data as represented by Firebase/Google Sign-In).
4. Return to Eduvora and successful account/course navigation.
5. A course resource in the Player and the email-only personal-access flow.
6. The absence of any learner Drive-consent prompt; the requested file share is
   fulfilled by the operator-side server/Apps Script workflow.
7. The public privacy policy URL and Google-data section.

Do not stage a fake consent screen, use invented credentials, expose a
password, or show secret server configuration in the video.

## Google Cloud Console checklist (external; not performed by this repository)

- Verify the production OAuth consent-screen app name/logo/support email and
  authorized domains.
- Set the homepage and privacy-policy URLs to the production links above.
- Keep only the minimum identity sign-in access needed by Firebase Google
  Sign-In. Do **not** add a Drive scope for branding or verification.
- Confirm the deployed production build is the build represented in the video.
- Upload the final unlisted/private demo video and retain the URL for the reply.
- Create or allowlist a reviewer test account without 2-Step Verification if
  Google requests credentials for a manual review.

## Reply template for Trust and Safety

Send this in the existing Google email thread after the external steps are
complete. Fill every placeholder privately; never commit the completed reply or
credentials here.

```text
Hello Google Trust and Safety,

Thank you for the review. The requested production details are:

App: Eduvora | Digital Catalyst
Homepage/login: https://eduvora.shop/#/auth
Privacy policy: https://eduvora.shop/privacy-policy.html
Demo video: <FINAL_VIDEO_URL>

Reviewer navigation:
1. Open the login URL and choose Continue with Google.
2. Sign in with the authorized reviewer account below.
3. Open Home, select <COURSE_NAME>, open <MODULE_NAME>, and choose a Google
   Docs/Sheets/Slides resource.
4. Open Player → Gate personal access, enter <AUTHORIZED_REVIEWER_EMAIL>,
   confirm, and check the resulting Drive share/invite.

The production app requests only basic Google identity sign-in data. It does
not request or receive a learner Google Drive OAuth token. The optional file
workflow sends the learner-entered email and selected course resource to the
operator-controlled server/Apps Script account, which prepares and shares the
file from the operator's Drive.

Authorized reviewer account (shared only in this email thread):
Email: <REVIEWER_EMAIL>
Password: <REVIEWER_PASSWORD>
2-Step Verification: disabled for review, if applicable

Please let us know if another authorized account or navigation path is needed.

Regards,
<OWNER_NAME>
```

## Before sending

- [ ] The production deployment contains the no-learner-Drive-consent build.
- [ ] The homepage and privacy-policy URLs load without authentication.
- [ ] The test account is authorized and has the required course entitlement.
- [ ] The recording shows the real Google consent screen and real app flow.
- [ ] The video is uploaded and its URL is accessible to reviewers.
- [ ] Credentials are authorized, temporary/review-only where possible, and
      are being sent only through Google's requested email channel.
- [ ] No credentials or secrets were added to git, screenshots, logs or video.
