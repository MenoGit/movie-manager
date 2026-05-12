import TVShowModal from './TVShowModal'
import {
  getAnimeDetail, getAnimeSeason, searchAnimeTorrents, addAnimeTorrent,
} from '../api'

const ANIME_API = {
  getDetail: getAnimeDetail,
  getSeason: getAnimeSeason,
  searchTorrents: searchAnimeTorrents,
  addTorrent: addAnimeTorrent,
}

export default function AnimeModal({ show, onClose }) {
  return (
    <TVShowModal
      show={show}
      onClose={onClose}
      api={ANIME_API}
      savePathLabel="TV-Shows"
    />
  )
}
