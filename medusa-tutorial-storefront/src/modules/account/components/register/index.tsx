"use client"

import { useActionState } from "react"
import Input from "@modules/common/components/input"
import { LOGIN_VIEW } from "@modules/account/templates/login-template"
import ErrorMessage from "@modules/checkout/components/error-message"
import { SubmitButton } from "@modules/checkout/components/submit-button"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import { signup } from "@lib/data/customer"

type Props = {
  setCurrentView: (view: LOGIN_VIEW) => void
}

const Register = ({ setCurrentView }: Props) => {
  const [message, formAction] = useActionState(signup, null)

  return (
    <div
      className="max-w-sm flex flex-col items-center"
      data-testid="register-page"
    >
      <h1 className="text-large-semi uppercase mb-6">
        Konto-Registrierung
      </h1>
      <p className="text-center text-base-regular text-ui-fg-base mb-4">
        Registrieren Sie hier ein neues Konto um immer auf dem neusten Stand über neue Produkte sein zu können.
      </p>
      <form className="w-full flex flex-col" action={formAction}>
        <div className="flex flex-col w-full gap-y-2">
          <Input
            label="First name"
            name="first_name"
            required
            autoComplete="given-name"
            data-testid="first-name-input"
          />
          <Input
            label="Last name"
            name="last_name"
            required
            autoComplete="family-name"
            data-testid="last-name-input"
          />
          <Input
            label="Email"
            name="email"
            required
            type="email"
            autoComplete="email"
            data-testid="email-input"
          />
          <Input
            label="Phone"
            name="phone"
            type="tel"
            autoComplete="tel"
            data-testid="phone-input"
          />
          <Input
            label="Password"
            name="password"
            required
            type="password"
            autoComplete="new-password"
            data-testid="password-input"
          />
        </div>
        <ErrorMessage error={message} data-testid="register-error" />
        <span className="text-center text-ui-fg-base text-small-regular mt-6">
          Beim Erstellen eines neuen Kontos, müssen Sie unseren Geschäftsbedingungen und Nutzungsbedingungen zustimmen.
          <LocalizedClientLink
            href="/content/privacy-policy"
            className="underline"
          >
            Geschäftsbedingungen,
          </LocalizedClientLink>{" "}
       
          <LocalizedClientLink
            href="/content/terms-of-use"
            className="underline"
          >
            Nutzungsbedingungen
          </LocalizedClientLink>
          .
        </span>
        <SubmitButton className="w-full mt-6 bg-orange-950 hover:bg-orange-900" data-testid="register-button">
          jetzt registrieren
        </SubmitButton>
      </form>
      <span className="text-center text-ui-fg-base text-small-regular mt-6">
        Haben Sie schon ein Konto?{" "}
        <button
          onClick={() => setCurrentView(LOGIN_VIEW.SIGN_IN)}
          className="underline"
        >
          Anmeldung
        </button>
        .
      </span>
    </div>
  )
}

export default Register
