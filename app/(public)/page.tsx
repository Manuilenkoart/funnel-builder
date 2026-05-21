import { redirect } from 'next/navigation';

export default function RootLandingPage() {
  // Redirect root path to the default funnel (quiz-1)
  redirect('/quiz-1');
}
