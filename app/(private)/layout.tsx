import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { AUTH_COOKIE, isAuthValue } from '@/app/lib/auth';

export default async function PrivateLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies();
  if (!isAuthValue(cookieStore.get(AUTH_COOKIE)?.value)) {
    redirect('/login');
  }

  return <div className="private-layout">{children}</div>;
}
