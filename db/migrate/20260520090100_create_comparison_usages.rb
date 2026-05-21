class CreateComparisonUsages < ActiveRecord::Migration[8.1]
  def change
    create_table :comparison_usages do |t|
      t.references :user, null: false, foreign_key: true
      t.date :period_start, null: false
      t.integer :comparisons_count, null: false, default: 0
      t.integer :products_count, null: false, default: 0

      t.timestamps
    end

    add_index :comparison_usages, [ :user_id, :period_start ], unique: true
  end
end
