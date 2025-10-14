import { createContext, useContext } from 'react';
import { Task, Appointment } from '../types';

export interface ModalContextType {
  openProductModal: () => void;
  openTaskModal: (defaultDate?: Date) => void;
  openExpenseModal: () => void;
  openAppointmentModal: (defaultDate?: Date) => void;
  openCustomerModal: () => void;
  openEditTaskModal: (task: Task) => void;
  openEditAppointmentModal: (appointment: Appointment) => void;
}

export const ModalContext = createContext<ModalContextType | undefined>(undefined);

export const useModal = () => {
    const context = useContext(ModalContext);
    if (!context) throw new Error('useModal must be used within a ModalProvider');
    return context;
};