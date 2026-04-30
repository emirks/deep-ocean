import type { Rule, GatewayDef } from './index'

export interface IpcChannels {
  'rules:get-all':         { args: void;                                          result: Rule[]       }
  'rules:add':             { args: Omit<Rule, 'id' | 'status' | 'createdAt'>;    result: Rule         }
  'rules:update':          { args: { id: string } & Partial<Rule>;               result: Rule         }
  'rules:remove':          { args: { id: string };                               result: void         }
  'rules:block-now':       { args: { id: string };                               result: void         }
  'rules:unblock-now':     { args: { id: string; duration?: number };            result: void         }
  'blockers:types':        { args: void;                                          result: { type: string; label: string }[] }
  'app:pause-all':         { args: { duration: number };                         result: void         }
  'dialog:folder':         { args: void;                                          result: string | null }
  'dialog:exe':            { args: void;                                          result: string | null }
  'settings:get':          { args: void;                                          result: import('./index').AppSettings }
  'settings:update':       { args: Partial<import('./index').AppSettings>;       result: void         }
  'gateways:get-all':      { args: void;                                          result: GatewayDef[] }
  'gateways:add':          { args: Omit<GatewayDef, 'id' | 'createdAt'>;        result: GatewayDef   }
  'gateways:update':       { args: { id: string } & Partial<GatewayDef>;        result: GatewayDef   }
  'gateways:remove':       { args: { id: string };                               result: void         }
  'system:server-time':    { args: void;                                          result: { serverTime: string; localTime: string; offsetMs: number } }
}
