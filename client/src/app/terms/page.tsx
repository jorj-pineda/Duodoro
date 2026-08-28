import type { Metadata } from "next";
import LegalPage from "@/components/LegalPage";

export const metadata: Metadata = {
  title: "Terms — Duodoro",
  description: "The terms for using Duodoro.",
};

export default function TermsPage() {
  return (
    <LegalPage title="Terms of Service" effectiveDate="August 27, 2026">
      <section>
        <h2>1. Agreement</h2>
        <p>
          These Terms govern your use of Duodoro, an independent shared focus
          timer. By signing in or using Duodoro, you agree to these Terms. If
          you do not agree, do not use the service.
        </p>
      </section>

      <section>
        <h2>2. Eligibility and accounts</h2>
        <p>
          You must be at least 13 years old and able to enter this agreement
          where you live. You sign in through Google or Discord and are
          responsible for protecting that provider account and for activity
          under your Duodoro profile.
        </p>
      </section>

      <section>
        <h2>3. Acceptable use</h2>
        <p>You may not use Duodoro to:</p>
        <ul>
          <li>break the law or violate another person’s rights;</li>
          <li>harass, impersonate, threaten, or deceive anyone;</li>
          <li>probe, disrupt, overload, or bypass the service’s security;</li>
          <li>upload malicious code or use automation that harms the service; or</li>
          <li>access another person’s account or non-public data.</li>
        </ul>
      </section>

      <section>
        <h2>4. Your content</h2>
        <p>
          You keep ownership of task text, profile choices, and other content
          you provide. You give Duodoro permission to host, process, and show
          that content only as needed to operate features you choose, including
          sharing session tasks with your session partner.
        </p>
        <p>
          Do not submit content you do not have permission to use. Avoid
          placing sensitive personal information in tasks or profile fields.
        </p>
      </section>

      <section>
        <h2>5. Premium and email</h2>
        <p>
          Duodoro’s current premium unlock is free and does not collect payment
          information. Marketing email requires a separate choice and may be
          turned off in Privacy &amp; account without losing premium access.
          Future paid features will come with their own price and terms before
          you purchase them.
        </p>
      </section>

      <section>
        <h2>6. Service changes and termination</h2>
        <p>
          Duodoro may change, pause, or discontinue features and may restrict
          accounts that violate these Terms or threaten the service or its
          users. You may stop using Duodoro or permanently delete your account
          from Privacy &amp; account at any time.
        </p>
      </section>

      <section>
        <h2>7. Disclaimers</h2>
        <p>
          Duodoro is provided “as is” and “as available.” To the extent the law
          permits, no warranty is made that it will always be available,
          secure, or error-free. Duodoro is a productivity tool, not medical,
          mental-health, employment, or professional advice.
        </p>
      </section>

      <section>
        <h2>8. Limitation of liability</h2>
        <p>
          To the extent permitted by applicable law, Duodoro and its operator
          will not be liable for indirect, incidental, special, consequential,
          or punitive damages, or for lost data, profits, or opportunities
          arising from use of the service. Rights that cannot legally be
          limited remain unaffected.
        </p>
      </section>

      <section>
        <h2>9. Changes to these Terms</h2>
        <p>
          Material changes will be posted here with a new effective date and,
          when appropriate, called out in the service. Continued use after a
          change takes effect means you accept the updated Terms.
        </p>
      </section>

      <section>
        <h2>10. Contact</h2>
        <p>
          Questions about these Terms can be sent to{" "}
          <a href="mailto:jorgepineda0310@gmail.com">
            jorgepineda0310@gmail.com
          </a>
          . These Terms are governed by applicable law; mandatory consumer
          protections where you live still apply.
        </p>
      </section>
    </LegalPage>
  );
}
