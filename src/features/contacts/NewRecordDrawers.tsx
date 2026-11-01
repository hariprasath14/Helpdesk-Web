import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { useToast } from '../../components/toast-context';
import { CompanyDrawer } from './CompanyDrawer';
import { ContactDrawer } from './ContactDrawer';
import { refreshDirectory } from './directory';

interface NewRecordDrawerProps {
  onClose: () => void;
}

/** Shared by both drawers: after saving, refresh the lists, confirm and open the record. */
function useOpenSaved(onClose: () => void) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const navigate = useNavigate();
  return (path: string, message: string) => {
    onClose();
    void refreshDirectory(queryClient);
    toast({ tone: 'success', message });
    void navigate(path);
  };
}

/** Add contact, from the Contacts page or the top bar's New menu. */
export function NewContactDrawer({ onClose }: NewRecordDrawerProps) {
  const openSaved = useOpenSaved(onClose);
  return (
    <ContactDrawer
      onClose={onClose}
      onSaved={(contact, message) => {
        openSaved(`/contacts/${contact.id}`, message);
      }}
    />
  );
}

/** Add company, from the Companies page or the top bar's New menu. */
export function NewCompanyDrawer({ onClose }: NewRecordDrawerProps) {
  const openSaved = useOpenSaved(onClose);
  return (
    <CompanyDrawer
      onClose={onClose}
      onSaved={(company, message) => {
        openSaved(`/companies/${company.id}`, message);
      }}
    />
  );
}
