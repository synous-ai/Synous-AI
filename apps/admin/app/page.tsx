import { redirect } from 'next/navigation'

/**
 * La raíz no tiene página propia: el sitio público vive fuera de esta app.
 *
 * Por el host del panel (`app.*`, `admin.*`) el middleware reescribe `/` al
 * dashboard antes de llegar acá, así que esto sólo corre para el apex o
 * `localhost` pelado — ahí mandamos al login, que es lo único que esta app
 * ofrece sin un host que la enrute.
 */
export default function RootPage() {
  redirect('/admin/login')
}
