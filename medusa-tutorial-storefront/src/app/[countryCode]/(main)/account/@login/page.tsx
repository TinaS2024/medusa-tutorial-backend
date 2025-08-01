import { Metadata } from "next"

import LoginTemplate from "@modules/account/templates/login-template"

export const metadata: Metadata = {
  title: "Anmeldung",
  description: "Melden Sie sich in ihrem Medusa-Store an.",
}

export default function Login() {
  return <LoginTemplate />
}
