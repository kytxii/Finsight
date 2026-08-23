import client from './client';
import * as demo from './demoStore';

const isDemo = () => localStorage.getItem('demo') === 'true';

export const getTipDeposits   = ()     => isDemo() ? demo.getTipDeposits()        : client.get('/tip-deposits/');
export const createTipDeposit = (data)   => isDemo() ? demo.createTipDeposit(data)     : client.post('/tip-deposits/', data);
export const updateTipDeposit = (id, data) => isDemo() ? demo.updateTipDeposit(id, data) : client.patch(`/tip-deposits/${id}`, data);
export const deleteTipDeposit = (id)     => isDemo() ? demo.deleteTipDeposit(id)       : client.delete(`/tip-deposits/${id}`);
export const getCashOnHand    = ()     => isDemo() ? demo.getCashOnHand()         : client.get('/tip-deposits/cash-on-hand');
