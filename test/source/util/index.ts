
import * as fs from 'fs';

interface TestConfigInterface {
  messages: {name: string, content: string[], params: string}[];
  unit_tests: {name: string, f: string, args: any[], result: any}[];
}

interface TestSecretsInterface {
  auth: { google: {email: string, password: string, backup: string}[],};
  keys: {title: string, passphrase: string, armored: string|null, keywords: string|null}[];
}

export class Config {

  public static extension_id = '';

  public static secrets = JSON.parse(fs.readFileSync('test/test-secrets.json', 'utf8')) as TestSecretsInterface;

  public static tests = JSON.parse(fs.readFileSync('test/tests.json', 'utf8')) as TestConfigInterface;

  public static key = (title: string) => Config.secrets.keys.filter(k => k.title === title)[0];

}

export class Util {

  public static sleep = (seconds: number) => new Promise(resolve => setTimeout(resolve, seconds * 1000));

  public static random = () => Math.random().toString(36).substring(7);

}