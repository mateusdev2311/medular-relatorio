import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { carregarConfig } from '../src/config';

const conta = { client_email: 'sa@p.iam.gserviceaccount.com', private_key: '-----BEGIN PRIVATE KEY-----\\nabc\\n-----END PRIVATE KEY-----\\n' };
const oauth = { GOOGLE_CLIENT_ID: 'id.apps.googleusercontent.com', GOOGLE_CLIENT_SECRET: 'GOCSPX-x', GOOGLE_REFRESH_TOKEN: '1//r' };

describe('carregarConfig', () => {
  it('aceita a conta de serviço em JSON cru ou base64 e corrige \\n literais', () => {
    for (const valor of [JSON.stringify(conta), Buffer.from(JSON.stringify(conta)).toString('base64')]) {
      const cfg = carregarConfig({ MEDULAR_API_KEY: 'k', GOOGLE_SERVICE_ACCOUNT_JSON: valor });
      assert.equal(cfg.google.tipo, 'conta-servico');
      assert.ok(cfg.google.tipo === 'conta-servico' && cfg.google.conta.private_key.includes('\nabc\n'));
    }
  });

  it('aceita OAuth de usuário e aplica os padrões', () => {
    const cfg = carregarConfig({ MEDULAR_API_KEY: 'k', ...oauth });
    assert.deepEqual(cfg.google, { tipo: 'oauth', oauth: { clientId: oauth.GOOGLE_CLIENT_ID, clientSecret: 'GOCSPX-x', refreshToken: '1//r' } });
    assert.equal(cfg.medularQueueId, 25);
    assert.equal(cfg.port, 3000);
    assert.equal(cfg.cronSchedule, '0 5,14 * * *');
  });

  it('aponta o que falta', () => {
    assert.throws(() => carregarConfig({}), /MEDULAR_API_KEY; GOOGLE_SERVICE_ACCOUNT_JSON/);
    assert.throws(
      () => carregarConfig({ MEDULAR_API_KEY: 'k', GOOGLE_CLIENT_ID: 'a', GOOGLE_CLIENT_SECRET: 'b' }),
      /faltam: GOOGLE_REFRESH_TOKEN/,
    );
  });
});
