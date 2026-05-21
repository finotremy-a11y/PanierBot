class CreateUsers < ActiveRecord::Migration[8.1]
  def change
    create_table :users do |t|
      t.string :email, null: false, default: ""
      t.string :encrypted_password, null: false, default: ""

      t.string :reset_password_token
      t.datetime :reset_password_sent_at
      t.datetime :remember_created_at

      t.string :plan, null: false, default: "free"
      t.string :subscription_status, null: false, default: "inactive"
      t.string :stripe_customer_id
      t.string :stripe_subscription_id

      t.timestamps null: false
    end

    add_index :users, :email, unique: true
    add_index :users, :reset_password_token, unique: true
    add_index :users, :stripe_customer_id, unique: true
    add_index :users, :stripe_subscription_id, unique: true
  end
end
