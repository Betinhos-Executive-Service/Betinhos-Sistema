import { temAlgum, type Acessos, type Perfil } from '../app/acessos'
import mapaJson from './acessosMapa.json'
import { MENU, type MenuGroup } from './menu'

const ROTAS = (mapaJson as unknown as { rotas: Record<string, { perfis?: Perfil[] }> }).rotas

/** Perfis que abrem a rota; `undefined` = livre para todos. A fonte é o mapa, o mesmo que gera os papéis. */
export const perfisDoItem = (id: string): Perfil[] | undefined => ROTAS[id]?.perfis

/** O menu que a pessoa alcança; grupo sem item visível some. */
export function menuVisivel(acessos: Acessos, menu: MenuGroup[] = MENU): MenuGroup[] {
  return menu
    .map((grupo) => ({ ...grupo, items: grupo.items.filter((item) => temAlgum(acessos, perfisDoItem(item.id))) }))
    .filter((grupo) => grupo.items.length > 0)
}
