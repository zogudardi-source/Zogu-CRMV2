import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../services/supabase';
import { CubeIcon } from '@heroicons/react/24/solid';

const ResetPasswordPage: React.FC = () => {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const navigate = useNavigate();

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password.length < 6) {
      setError('Password must be at least 6 characters long.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    
    setLoading(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    
    if (updateError) {
      setError(updateError.message);
    } else {
      setSuccess(true);
      // It's a good security practice to sign the user out after a password change
      // to invalidate the recovery session.
      await supabase.auth.signOut();
      setTimeout(() => {
        navigate('/auth');
      }, 3000); // Redirect after 3 seconds
    }
    
    setLoading(false);
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-100 dark:bg-gray-900">
      <div className="w-full max-w-md p-8 mx-4 space-y-6 bg-white rounded-lg shadow-2xl dark:bg-gray-800">
        <div className="text-center">
          <CubeIcon className="w-12 h-12 mx-auto text-primary-500" />
          <h1 className="mt-4 text-2xl font-bold text-gray-900 dark:text-white">
            Set a New Password
          </h1>
        </div>
        
        {success ? (
          <div className="text-center">
            <p className="text-green-600 dark:text-green-400">
              Your password has been successfully updated!
            </p>
            <p className="mt-2 text-gray-600 dark:text-gray-300">
              Redirecting you to the login page...
            </p>
          </div>
        ) : (
          <form onSubmit={handleResetPassword} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">New Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full px-3 py-2 mt-1 text-gray-900 bg-gray-100 border border-gray-300 rounded-md focus:outline-none focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700 dark:text-white dark:border-gray-600"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Confirm New Password</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                className="w-full px-3 py-2 mt-1 text-gray-900 bg-gray-100 border border-gray-300 rounded-md focus:outline-none focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700 dark:text-white dark:border-gray-600"
              />
            </div>

            {error && <p className="text-sm text-center text-red-500">{error}</p>}

            <div>
              <button
                type="submit"
                disabled={loading}
                className="w-full px-4 py-2 text-sm font-medium text-white bg-primary-600 border border-transparent rounded-md shadow-sm hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:bg-primary-300"
              >
                {loading ? 'Updating...' : 'Update Password'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

export default ResetPasswordPage;
