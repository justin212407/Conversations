import { SignUp } from "@clerk/nextjs"

export const SignUpView = () => {
  return (
    <SignUp
      routing="path"
      path="/sign-up"
      signInUrl="/sign-in"
      fallbackRedirectUrl="/conversations"
    />
  )
}
