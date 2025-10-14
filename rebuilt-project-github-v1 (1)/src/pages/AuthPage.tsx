import React, { useState, useEffect } from 'react';
import { supabase } from '../services/supabase';
import { useNavigate, useLocation } from 'react-router-dom';
import { CubeIcon } from '@heroicons/react/24/solid';
import { useLanguage } from '../contexts/LanguageContext';
import { useAuth } from '../contexts/AuthContext';

// Define components outside the main AuthPage component to prevent re-creation on re-render.

interface AuthFormProps {
  handleAuthAction: (e: React.FormEvent) => void;
  isLoginView: boolean;
  loading: boolean;
  email: string;
  setEmail: (email: string) => void;
  password: string;
  setPassword: (password: string) => void;
  fullName: string;
  setFullName: (name: string) => void;
  invitationCode: string;
  setInvitationCode: (code: string) => void;
  isEmailInvite: boolean; // Add this prop
  t: (key: any) => string;
  setForgotPasswordView: (value: boolean) => void;
}

const AuthForm: React.FC<AuthFormProps> = ({
  handleAuthAction, isLoginView, loading, email, setEmail, password, setPassword,
  fullName, setFullName, invitationCode, setInvitationCode, isEmailInvite, t, setForgotPasswordView
}) => (
  <form onSubmit={handleAuthAction} className="space-y-6">
    {!isLoginView && (
      <>
        {/* Conditionally render the invitation code field */}
        {!isEmailInvite && (
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Invitation Code</label>
            <input type="text" value={invitationCode} onChange={(e) => setInvitationCode(e.target.value)} required placeholder="Enter your invitation code" className="w-full px-3 py-2 mt-1 text-gray-900 bg-gray-100 border border-gray-300 rounded-md focus:outline-none focus:ring-primary-500 focus:border-primary-500 dark:bg-slate-700 dark:text-white dark:border-slate-600" />
          </div>
        )}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">{t('full_name')}</label>
          <input type="text" value={fullName} onChange={(e) => setFullName(e.target.value)} required className="w-full px-3 py-2 mt-1 text-gray-900 bg-gray-100 border border-gray-300 rounded-md focus:outline-none focus:ring-primary-500 focus:border-primary-500 dark:bg-slate-700 dark:text-white dark:border-slate-600" />
        </div>
      </>
    )}
    <div>
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">{t('email')}</label>
      <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className="w-full px-3 py-2 mt-1 text-gray-900 bg-gray-100 border border-gray-300 rounded-md focus:outline-none focus:ring-primary-500 focus:border-primary-500 dark:bg-slate-700 dark:text-white dark:border-slate-600" />
    </div>
    <div>
      <div className="flex justify-between">
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">{t('password')}</label>
        {isLoginView && <button type="button" onClick={() => setForgotPasswordView(true)} className="text-sm text-primary-600 hover:underline">{t('forgotPassword')}</button>}
      </div>
      <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required className="w-full px-3 py-2 mt-1 text-gray-900 bg-gray-100 border border-gray-300 rounded-md focus:outline-none focus:ring-primary-500 focus:border-primary-500 dark:bg-slate-700 dark:text-white dark:border-slate-600" />
    </div>
    <div>
      <button type="submit" disabled={loading} className="w-full px-4 py-2 text-sm font-medium text-white bg-primary-600 border border-transparent rounded-md shadow-sm hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:bg-primary-300">
        {loading ? t('processing') : (isLoginView ? t('login') : t('signUp'))}
      </button>
    </div>
  </form>
);

interface ForgotPasswordFormProps {
    handlePasswordReset: (e: React.FormEvent) => void;
    loading: boolean;
    email: string;
    setEmail: (email: string) => void;
    t: (key: any) => string;
}

const ForgotPasswordForm: React.FC<ForgotPasswordFormProps> = ({ handlePasswordReset, loading, email, setEmail, t }) => (
  <form onSubmit={handlePasswordReset} className="space-y-6">
      <p className="text-sm text-gray-600 dark:text-gray-400">{t('forgotPasswordInstructions')}</p>
      <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">{t('email')}</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className="w-full px-3 py-2 mt-1 text-gray-900 bg-gray-100 border border-gray-300 rounded-md focus:outline-none focus:ring-primary-500 focus:border-primary-500 dark:bg-slate-700 dark:text-white dark:border-slate-600" />
      </div>
      <div>
          <button type="submit" disabled={loading} className="w-full px-4 py-2 text-sm font-medium text-white bg-primary-600 border border-transparent rounded-md shadow-sm hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:bg-primary-300">
          {loading ? t('sending') : t('requestReset')}
          </button>
      </div>
  </form>
);


const AuthPage: React.FC = () => {
  const [isLoginView, setIsLoginView] = useState(true);
  const [forgotPasswordView, setForgotPasswordView] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [invitationCode, setInvitationCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isEmailInvite, setIsEmailInvite] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useLanguage();
  const { session } = useAuth();

  useEffect(() => {
    if (session) {
      navigate('/');
    }
  }, [session, navigate]);
  
  useEffect(() => {
    // Check for email invite token in the URL hash on component mount
    if (location.hash.includes('invitation_token=')) {
        setIsEmailInvite(true);
    }
  }, [location.hash]);


  if (session) {
    return null; // Render nothing while the navigation effect is running
  }

  const handleAuthAction = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);

    if (isLoginView) {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setError(error.message);
      else navigate('/');
    } else {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName,
            // Conditionally add invitation_code only if it's not an email invite
            ...(!isEmailInvite && { invitation_code: invitationCode }),
          },
        },
      });
      if (error) setError(error.message);
      else setMessage(t('registrationSuccessMessage'));
    }
    setLoading(false);
  };
  
  const handlePasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + '/#/reset-password',
    });
    if (error) {
      setError(error.message);
    } else {
      setMessage('Password reset instructions have been sent to your email.');
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-white dark:bg-slate-800 lg:grid lg:grid-cols-2">
        {/* Branding Column */}
        <div className="hidden lg:flex flex-col items-center justify-center bg-slate-900 p-12 text-center relative">
            <div className="absolute inset-0 bg-gradient-to-br from-primary-600/20 to-slate-900"></div>
            <div className="relative z-10">
                <CubeIcon className="w-16 h-16 mx-auto text-primary-500" />
                <h2 className="mt-6 text-4xl font-bold text-white">ZoguOne</h2>
                <p className="mt-4 text-lg text-slate-300 max-w-sm mx-auto">
                    Your all-in-one solution for inventory, invoicing, and service management.
                </p>
            </div>
        </div>

        {/* Form Column */}
        <div className="flex items-center justify-center p-6 sm:p-12">
            <div className="w-full max-w-md">
                <div className="text-center mb-8">
                    <CubeIcon className="w-12 h-12 mx-auto text-primary-500 lg:hidden" />
                    <h1 className="mt-4 text-3xl font-bold text-gray-900 dark:text-white">
                        {forgotPasswordView ? t('forgotPasswordTitle') : (isLoginView ? t('welcomeBack') : t('createYourAccount'))}
                    </h1>
                </div>

                {error && <div className="p-4 mb-6 text-sm text-red-800 bg-red-100 rounded-lg dark:bg-red-900/30 dark:text-red-300" role="alert">{error}</div>}
                {message && <div className="p-4 mb-6 text-sm text-green-800 bg-green-100 rounded-lg dark:bg-green-900/30 dark:text-green-300" role="alert">{message}</div>}

                {forgotPasswordView 
                    ? <ForgotPasswordForm 
                        handlePasswordReset={handlePasswordReset}
                        loading={loading}
                        email={email}
                        setEmail={setEmail}
                        t={t}
                      /> 
                    : <AuthForm 
                        handleAuthAction={handleAuthAction}
                        isLoginView={isLoginView}
                        loading={loading}
                        email={email}
                        setEmail={setEmail}
                        password={password}
                        setPassword={setPassword}
                        fullName={fullName}
                        setFullName={setFullName}
                        invitationCode={invitationCode}
                        setInvitationCode={setInvitationCode}
                        isEmailInvite={isEmailInvite}
                        t={t}
                        setForgotPasswordView={setForgotPasswordView}
                      />
                }

                <div className="text-sm text-center mt-8">
                  {forgotPasswordView ? (
                     <button onClick={() => setForgotPasswordView(false)} className="font-medium text-primary-600 hover:underline">{t('backToLogin')}</button>
                  ) : (
                    <span className="text-gray-600 dark:text-gray-400">
                        {isLoginView ? t('dontHaveAccount') : t('alreadyHaveAccount')}
                        <button onClick={() => { setIsLoginView(!isLoginView); setError(null); }} className="font-medium text-primary-600 hover:underline">
                          {isLoginView ? t('signUp') : t('login')}
                        </button>
                    </span>
                  )}
                </div>
            </div>
        </div>
    </div>
  );
};

export default AuthPage;