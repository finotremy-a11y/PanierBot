class StoreRegistry
  STORES = {
    leclerc: {
      label: "Leclerc",
      home_url: "https://www.leclercdrive.fr/",
      stores: [
        { id: "leclerc-paris", name: "Leclerc Drive Paris", city: "Paris", available: true }
      ]
    },
    carrefour: {
      label: "Carrefour",
      home_url: "https://www.carrefour.fr/services/drive",
      stores: [
        { id: "carrefour-paris", name: "Carrefour Drive Paris", city: "Paris", available: true }
      ]
    },
    intermarche: {
      label: "Intermarche",
      home_url: "https://www.intermarche.com",
      stores: [
        { id: "intermarche-paris", name: "Intermarche Drive Paris", city: "Paris", available: true }
      ]
    },
    superu: {
      label: "Super U",
      home_url: "https://www.coursesu.com/",
      stores: [
        { id: "superu-paris", name: "Super U Paris", city: "Paris", available: true }
      ]
    }
  }.freeze

  def self.available_stores
    STORES.map do |key, data|
      {
        key: key,
        label: data[:label],
        home_url: data[:home_url],
        stores: data[:stores]
      }
    end
  end
end
