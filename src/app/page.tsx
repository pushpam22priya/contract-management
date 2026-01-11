'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { authService } from '@/services/authService';

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    // Check if user is authenticated
    const currentUser = authService.getCurrentUser();

    if (currentUser) {
      // User is authenticated, redirect to dashboard
      router.push('/dashboard');
    } else {
      // User is not authenticated, redirect to login
      router.push('/login');
    }
  }, [router]);

  // Show nothing while redirecting
  return null;
}
