import { RouterProvider } from 'react-router-dom';
import { router } from './router.tsx';

/**
 * Root App component
 * Simple routing wrapper for the application
 */
export default function App() {
  return <RouterProvider router={router} />;
}
