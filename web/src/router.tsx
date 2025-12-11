import { createBrowserRouter } from 'react-router-dom';
import { MainPage } from '@/pages/MainPage.tsx';
import { EventPage } from '@/pages/EventPage.tsx';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <MainPage />,
  },
  {
    path: '/events/:id',
    element: <EventPage />,
  },
]);
