import { ehArea, temAlgum, type Acessos, type Perfil } from '../app/acessos'
import mapaJson from './acessosMapa.json'
import { MENU, type MenuGroup } from './menu'

const ehPerfil = (valor: string): valor is Perfil => valor === 'acessos' || ehArea(valor)
const rotas: Record<string, { perfis?: string[]; pastas: string[] }> = mapaJson.rotas
const ROTAS = new Map(Object.entries(rotas).map(([id, rota]) => [id, rota.perfis?.filter(ehPerfil)]))

/** Perfis que abrem a rota; `undefined` = livre para todos. A fonte é o mapa, o mesmo que gera os papéis. */
export const perfisDoItem = (id: string): Perfil[] | undefined => ROTAS.get(id)

/** O menu que a pessoa alcança (rotas `foraDoMenu` não entram); grupo sem item visível some. */
export function menuVisivel(acessos: Acessos, menu: MenuGroup[] = MENU): MenuGroup[] {
  return menu
    .map((grupo) => ({ ...grupo, items: grupo.items.filter((item) => !(item.kind === 'page' && item.foraDoMenu) && temAlgum(acessos, perfisDoItem(item.id))) }))
    .filter((grupo) => grupo.items.length > 0)
}
