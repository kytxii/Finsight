import client from './client';
import * as demo from './demoStore';

const isDemo = () => localStorage.getItem('demo') === 'true';

export const getInstallments        = ()         => isDemo() ? demo.getInstallments()          : client.get('/installments/');
export const createInstallment      = (data)     => isDemo() ? demo.createInstallment(data)     : client.post('/installments/', data);
export const updateInstallment      = (id, data) => isDemo() ? demo.updateInstallment(id, data)  : client.patch(`/installments/${id}`, data);
export const deleteInstallment      = (id)       => isDemo() ? demo.deleteInstallment(id)        : client.delete(`/installments/${id}`);
export const getInstallmentInsights = (id)       => isDemo() ? demo.getInstallmentInsights(id)   : client.get(`/installments/${id}/insights`);
