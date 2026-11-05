import { SignIn } from "@clerk/nextjs"

export const SignInView = () => {
  return (
    <SignIn
      routing="path"
      path="/sign-in"
      signUpUrl="/sign-up"
      fallbackRedirectUrl="/conversations"
    />
  )
}
