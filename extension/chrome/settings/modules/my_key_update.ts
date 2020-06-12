/* ©️ 2016 - present FlowCrypt a.s. Limitations apply. Contact human@flowcrypt.com */

'use strict';

import { ApiErr } from '../../../js/common/api/error/api-error.js';
import { Assert } from '../../../js/common/assert.js';
import { KeyInfo, Key, KeyUtil } from '../../../js/common/core/crypto/key.js';
import { Lang } from '../../../js/common/lang.js';
import { PgpArmor } from '../../../js/common/core/crypto/pgp/pgp-armor.js';
import { Settings } from '../../../js/common/settings.js';
import { Ui } from '../../../js/common/browser/ui.js';
import { Url, Str } from '../../../js/common/core/common.js';
import { View } from '../../../js/common/view.js';
import { OrgRules } from '../../../js/common/org-rules.js';
import { PubLookup } from '../../../js/common/api/pub-lookup.js';
import { KeyStore } from '../../../js/common/platform/store/key-store.js';
import { PassphraseStore } from '../../../js/common/platform/store/passphrase-store.js';
import { PgpKey } from '../../../js/common/core/crypto/pgp/openpgp-key.js';

View.run(class MyKeyUpdateView extends View {

  private readonly acctEmail: string;
  private readonly fingerprint: string;
  private readonly showKeyUrl: string;
  private readonly inputPrivateKey = $('.input_private_key');
  private readonly prvHeaders = PgpArmor.headers('privateKey');
  private primaryKi: KeyInfo | undefined;
  private orgRules!: OrgRules;
  private pubLookup!: PubLookup;

  constructor() {
    super();
    const uncheckedUrlParams = Url.parse(['acctEmail', 'fingerprint', 'parentTabId']);
    this.acctEmail = Assert.urlParamRequire.string(uncheckedUrlParams, 'acctEmail');
    this.fingerprint = Assert.urlParamRequire.optionalString(uncheckedUrlParams, 'fingerprint') || 'primary';
    this.showKeyUrl = Url.create('my_key.htm', uncheckedUrlParams);
  }

  public render = async () => {
    this.orgRules = await OrgRules.newInstance(this.acctEmail);
    this.pubLookup = new PubLookup(this.orgRules);
    [this.primaryKi] = await KeyStore.get(this.acctEmail, [this.fingerprint]);
    Assert.abortAndRenderErrorIfKeyinfoEmpty(this.primaryKi);
    $('.action_show_public_key').attr('href', this.showKeyUrl);
    $('.email').text(this.acctEmail);
    $('.fingerprint').text(Str.spaced(this.primaryKi.fingerprint));
    this.inputPrivateKey.attr('placeholder', this.inputPrivateKey.attr('placeholder') + ' (' + this.primaryKi.fingerprint + ')');
  }

  public setHandlers = () => {
    $('.action_update_private_key').click(this.setHandlerPrevent('double', () => this.updatePrivateKeyHandler()));
    $('.input_passphrase').keydown(this.setEnterHandlerThatClicks('.action_update_private_key'));
  }

  private storeUpdatedKeyAndPassphrase = async (updatedPrv: Key, updatedPrvPassphrase: string) => {
    const storedPassphrase = await PassphraseStore.get(this.acctEmail, this.primaryKi!.fingerprint, true);
    await KeyStore.add(this.acctEmail, KeyUtil.armor(updatedPrv));
    await PassphraseStore.set('local', this.acctEmail, this.primaryKi!.fingerprint, typeof storedPassphrase !== 'undefined' ? updatedPrvPassphrase : undefined);
    await PassphraseStore.set('session', this.acctEmail, this.primaryKi!.fingerprint, typeof storedPassphrase !== 'undefined' ? undefined : updatedPrvPassphrase);
    if (this.orgRules.canSubmitPubToAttester() && await Ui.modal.confirm('Public and private key updated locally.\n\nUpdate public records with new Public Key?')) {
      try {
        await Ui.modal.info(await this.pubLookup.attester.updatePubkey(this.primaryKi!.longid, KeyUtil.armor(await KeyUtil.asPublicKey(updatedPrv))));
      } catch (e) {
        ApiErr.reportIfSignificant(e);
        await Ui.modal.error(`Error updating public records:\n\n${ApiErr.eli5(e)}\n\n(but local update was successful)`);
      }
    }
    window.location.href = this.showKeyUrl;
  }

  private updatePrivateKeyHandler = async () => {
    const updatedKey = await KeyUtil.parse(String(this.inputPrivateKey.val()));
    const updatedKeyEncrypted = await KeyUtil.parse(String(this.inputPrivateKey.val()));
    const uddatedKeyPassphrase = String($('.input_passphrase').val());
    if (typeof updatedKey === 'undefined') {
      await Ui.modal.warning(Lang.setup.keyFormattedWell(this.prvHeaders.begin, String(this.prvHeaders.end)), Ui.testCompatibilityLink);
    } else if (updatedKey.isPublic) {
      await Ui.modal.warning('This was a public key. Please insert a private key instead. It\'s a block of text starting with "' + this.prvHeaders.begin + '"');
    } else if (await PgpKey.fingerprint(updatedKey) !== await PgpKey.fingerprint(await KeyUtil.parse(this.primaryKi!.public))) {
      await Ui.modal.warning(`This key ${Str.spaced(await PgpKey.fingerprint(updatedKey) || 'err')} does not match your current key ${Str.spaced(this.primaryKi!.fingerprint)}`);
    } else if (await PgpKey.decrypt(updatedKey, uddatedKeyPassphrase) !== true) {
      await Ui.modal.error('The pass phrase does not match.\n\nPlease enter pass phrase of the newly updated key.');
    } else {
      if (updatedKey.usableForEncryption) {
        await this.storeUpdatedKeyAndPassphrase(updatedKeyEncrypted, uddatedKeyPassphrase);
        return;
      }
      // cannot get a valid encryption key packet
      if (await KeyUtil.isWithoutSelfCertifications(updatedKey) || updatedKey.usableButExpired) { // known issues - key can be fixed
        const fixedEncryptedPrv = await Settings.renderPrvCompatFixUiAndWaitTilSubmittedByUser(
          this.acctEmail, '.compatibility_fix_container', updatedKeyEncrypted, uddatedKeyPassphrase, this.showKeyUrl
        );
        await this.storeUpdatedKeyAndPassphrase(fixedEncryptedPrv, uddatedKeyPassphrase);
      } else {
        await Ui.modal.warning(
          'Key update: This looks like a valid key but it cannot be used for encryption. Email human@flowcrypt.com to see why is that. We\'re prompt to respond.',
          Ui.testCompatibilityLink
        );
        window.location.href = this.showKeyUrl;
      }
    }
  }

});
