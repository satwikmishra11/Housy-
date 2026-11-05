import React, { useState, useEffect, useRef } from 'react';
import { ShieldCheck, Phone, User, Check, Info } from 'lucide-react';
import { Button } from './Button.js';
import { Input } from './Input.js';
import { Checkbox } from './Checkbox.js';
import { Modal } from './Modal.js';

export interface CollectContactData {
  name: string;
  phone: string;
  consent: boolean;
}

export interface CollectContactCardProps {
  initialName?: string;
  initialPhone?: string;
  onSubmit: (data: CollectContactData) => void;
  isLoading?: boolean;
  className?: string;
}

export const CollectContactCard: React.FC<CollectContactCardProps> = ({
  initialName = '',
  initialPhone = '',
  onSubmit,
  isLoading = false,
  className = '',
}) => {
  const [name, setName] = useState(initialName);
  const [phone, setPhone] = useState(
    initialPhone.startsWith('+91') ? initialPhone.slice(3) : initialPhone,
  );
  const [consent, setConsent] = useState(true);
  const [phoneError, setPhoneError] = useState('');
  const [showPrivacyModal, setShowPrivacyModal] = useState(false);

  const nameInputRef = useRef<HTMLInputElement>(null);

  // Auto focus first input on appearance for keyboard accessibility
  useEffect(() => {
    nameInputRef.current?.focus();
  }, []);

  const validatePhone = (value: string): boolean => {
    const cleanDigits = value.replace(/\D/g, '');
    if (!cleanDigits) {
      setPhoneError('Mobile number is required to confirm your visit');
      return false;
    }
    // Validate Indian mobile 10 digits starting with 6-9
    const regex = /^[6-9]\d{9}$/;
    if (!regex.test(cleanDigits)) {
      setPhoneError('Please enter a valid 10-digit Indian mobile number');
      return false;
    }
    setPhoneError('');
    return true;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validatePhone(phone)) {
      return;
    }
    if (!consent) {
      return;
    }

    const cleanDigits = phone.replace(/\D/g, '');
    onSubmit({
      name: name.trim() || 'Guest Buyer',
      phone: `+91${cleanDigits}`,
      consent,
    });
  };

  return (
    <div
      className={`p-5 rounded-2xl bg-surface border border-accent/20 shadow-card max-w-md w-full ${className}`}
      role="region"
      aria-label="Contact and DPDP consent form"
    >
      <div className="flex items-start gap-3 mb-4">
        <div className="w-9 h-9 rounded-xl bg-accent-soft text-accent flex items-center justify-center flex-shrink-0">
          <ShieldCheck className="w-5 h-5 text-accent" />
        </div>
        <div>
          <h3 className="font-serif text-lg font-semibold text-ink leading-tight">
            Schedule Your Private Site Visit
          </h3>
          <p className="text-xs text-muted mt-1 leading-relaxed">
            Under DPDP guidelines, site visit bookings require your verified mobile number to send location pin & appointment confirmation.
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="contact-name" className="block text-xs font-medium text-ink mb-1.5">
            Your Full Name
          </label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-muted">
              <User className="w-4 h-4" />
            </div>
            <Input
              ref={nameInputRef}
              id="contact-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Vikram Patel"
              className="pl-9 text-sm"
              disabled={isLoading}
            />
          </div>
        </div>

        <div>
          <label htmlFor="contact-phone" className="block text-xs font-medium text-ink mb-1.5">
            Mobile Number (India) <span className="text-danger">*</span>
          </label>
          <div className="relative flex rounded-xl border border-hairline bg-surface focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/10">
            <span className="inline-flex items-center px-3 rounded-l-xl border-r border-hairline bg-background text-xs font-medium text-muted select-none">
              🇮🇳 +91
            </span>
            <input
              id="contact-phone"
              type="tel"
              value={phone}
              onChange={(e) => {
                setPhone(e.target.value);
                if (phoneError) validatePhone(e.target.value);
              }}
              onBlur={() => validatePhone(phone)}
              placeholder="98765 43210"
              maxLength={12}
              className="flex-1 min-w-0 px-3 py-2 text-sm bg-transparent border-0 focus:outline-none text-ink placeholder:text-muted/60"
              disabled={isLoading}
              required
              aria-invalid={Boolean(phoneError)}
              aria-describedby={phoneError ? 'phone-error' : undefined}
            />
          </div>
          {phoneError && (
            <p id="phone-error" className="text-xs text-danger mt-1.5 flex items-center gap-1" role="alert">
              <Phone className="w-3.5 h-3.5" />
              {phoneError}
            </p>
          )}
        </div>

        {/* DPDP Consent Checkbox */}
        <div className="pt-2">
          <Checkbox
            id="dpdp-consent"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
            disabled={isLoading}
            label={
              <span className="text-xs text-ink/90 leading-relaxed cursor-pointer select-none">
                I consent to receive site visit updates, directions, and project brochures via WhatsApp / SMS under the{' '}
                <span className="font-semibold text-accent">Digital Personal Data Protection Act 2023</span>.{' '}
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    setShowPrivacyModal(true);
                  }}
                  className="inline-flex items-center text-accent underline underline-offset-2 hover:text-accent-hover text-xs font-medium ml-1"
                >
                  <Info className="w-3 h-3 inline mr-0.5" />
                  Privacy Policy
                </button>
              </span>
            }
          />
          {!consent && (
            <p className="text-xs text-danger mt-1.5">
              Consent is required to reserve site visit slots in compliance with regulations.
            </p>
          )}
        </div>

        <Button
          type="submit"
          variant="primary"
          className="w-full justify-center text-sm py-2.5 mt-2"
          disabled={isLoading || !consent || !phone.trim()}
          isLoading={isLoading}
        >
          <Check className="w-4 h-4 mr-1.5" />
          Continue to Select Slots
        </Button>
      </form>

      {/* Privacy Notice Modal */}
      <Modal
        isOpen={showPrivacyModal}
        onClose={() => setShowPrivacyModal(false)}
        title="Privacy & Data Protection Notice"
      >
        <div className="space-y-4 text-xs text-ink/80 leading-relaxed">
          <p>
            <strong>Company A</strong> is committed to safeguarding your personal data in accordance with the <strong>Digital Personal Data Protection (DPDP) Act 2023</strong>.
          </p>
          <ul className="list-disc pl-4 space-y-1.5 text-muted">
            <li><strong>Purpose Limitation:</strong> Your phone number is strictly used to coordinate your private site visit and deliver RERA-registered brochures.</li>
            <li><strong>No Third-Party Sharing:</strong> We never sell, lease, or distribute buyer contact information to brokers or third parties.</li>
            <li><strong>Right to Withdraw (Opt-Out):</strong> You may opt-out or withdraw your consent at any time simply by replying <code>STOP</code> in chat or messaging our executive.</li>
            <li><strong>RERA Compliance:</strong> All residential communications are registered under GujRERA registration <code>PR/GJ/AHMEDABAD/AUDA/RAA01234/011126</code>.</li>
          </ul>
          <div className="pt-3 border-t border-hairline flex justify-end">
            <Button variant="secondary" size="sm" onClick={() => setShowPrivacyModal(false)}>
              Got it
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
