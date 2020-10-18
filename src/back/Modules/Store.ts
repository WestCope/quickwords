import ElectronStore from 'electron-store'
import { defaultSnippets } from '../default-snippets'
import { PlatformAware } from './PlatformAware'
import { Store as StoreContent } from '../../common/store'

export class Store {
  private store: ElectronStore<StoreContent>

  constructor(platformAware: PlatformAware) {
    this.store = new ElectronStore<StoreContent>({
      defaults: {
        user: Math.random().toString(36).slice(2),
        theme: platformAware.get('theme'),
        autoLaunch: true,
        snippets: defaultSnippets,
        bufferLength: 20,
        autoUpdate: true,
      },
    })
  }

  public set<T extends keyof StoreContent>(key: T, value: StoreContent[T]): void {
    this.store.set(key, value)
  }

  public get user(): StoreContent['user'] {
    return this.store.get('user')
  }

  public get theme(): StoreContent['theme'] {
    return this.store.get('theme')
  }

  public get autoLaunch(): StoreContent['autoLaunch'] {
    return this.store.get('autoLaunch')
  }

  public get snippets(): StoreContent['snippets'] {
    return this.store.get('snippets')
  }

  public get bufferLength(): StoreContent['bufferLength'] {
    return this.store.get('bufferLength')
  }

  public get autoUpdate(): StoreContent['autoUpdate'] {
    return this.store.get('autoUpdate')
  }
}
